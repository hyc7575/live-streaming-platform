import {
  applyDecorators,
  BadRequestException,
  Catch,
  PayloadTooLargeException,
  UploadedFile,
  UseFilters,
  UseInterceptors,
  type ArgumentsHost,
  type ExceptionFilter,
  type PipeTransform,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

export type ImageFormat = 'jpeg' | 'png' | 'webp';

const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

function startsWith(bytes: Uint8Array, prefix: number[], at = 0): boolean {
  return prefix.every((byte, i) => bytes[at + i] === byte);
}

// 형식은 매직 바이트로 정한다. 클라이언트가 주장하는 이름이나 Content-Type은
// 보지 않는다. 확장자는 서버가 정하며, 저장 파일 이름에 쓴다.
export const IMAGE_FORMATS: Record<
  ImageFormat,
  { ext: string; matches: (bytes: Uint8Array) => boolean }
> = {
  jpeg: { ext: 'jpg', matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  png: {
    ext: 'png',
    matches: (b) =>
      startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  webp: {
    ext: 'webp',
    matches: (b) => startsWith(b, RIFF) && startsWith(b, WEBP, 8),
  },
};

interface ImageRule {
  formats: readonly ImageFormat[];
  maxBytes: number;
  invalidMessage: string;
}

const USER_IMAGE_RULE = {
  formats: ['jpeg', 'png', 'webp'],
  maxBytes: 2 * 1024 * 1024,
  invalidMessage: '2MB 이하의 JPEG·PNG·WebP 이미지만 올릴 수 있습니다.',
} as const satisfies ImageRule;

export const IMAGE_RULES = {
  thumbnail: {
    formats: ['jpeg'],
    maxBytes: 512 * 1024,
    invalidMessage: '512KB 이하의 JPEG 이미지만 올릴 수 있습니다.',
  },
  standby: USER_IMAGE_RULE,
  // PRD-mypage 7.2: 프로필 이미지는 기본 대기 이미지 규칙을 그대로 따른다.
  avatar: USER_IMAGE_RULE,
} as const satisfies Record<string, ImageRule>;

export type ImageKind = keyof typeof IMAGE_RULES;

export interface ParsedImage {
  format: ImageFormat;
  bytes: Buffer;
}

// 이 모듈이 읽는 multer 파일의 일부. @types/multer는
// 의존성이 아니다.
interface MulterFile {
  buffer: Buffer;
}

// Multer는 너무 큰 파일을 413으로 알린다. 클라이언트에게는 이것도 이미지가
// 유효하지 않은 한 경우이므로, 형식이 틀렸을 때와 같은 400을 준다.
@Catch(PayloadTooLargeException)
class FileTooLargeFilter implements ExceptionFilter {
  constructor(private readonly message: string) {}

  catch(_error: PayloadTooLargeException, host: ArgumentsHost): void {
    const body = new BadRequestException(this.message).getResponse();
    host.switchToHttp().getResponse<Response>().status(400).json(body);
  }
}

// 파일이 없는 경우는 `image` 필드가 없는 multipart body와
// multipart가 아닌 body를 모두 포함한다.
class ParseImagePipe implements PipeTransform<
  MulterFile | undefined,
  ParsedImage
> {
  constructor(private readonly rule: ImageRule) {}

  transform(file: MulterFile | undefined): ParsedImage {
    const format =
      file &&
      this.rule.formats.find((f) => IMAGE_FORMATS[f].matches(file.buffer));
    if (!file || !format) {
      throw new BadRequestException(this.rule.invalidMessage);
    }
    return { format, bytes: file.buffer };
  }
}

export function ImageUpload(kind: ImageKind): MethodDecorator {
  const rule = IMAGE_RULES[kind];
  return applyDecorators(
    UseInterceptors(
      FileInterceptor('image', {
        limits: { fileSize: rule.maxBytes, files: 1 },
      }),
    ),
    UseFilters(new FileTooLargeFilter(rule.invalidMessage)),
  );
}

export function UploadedImage(kind: ImageKind): ParameterDecorator {
  return UploadedFile(new ParseImagePipe(IMAGE_RULES[kind]));
}
