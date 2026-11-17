import {
  BadRequestException,
  HttpException,
  UploadedFile,
  UseInterceptors,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type PipeTransform,
  type Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';

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

// #211: 이미지 라우트는 `image` 파일 파트 하나만 받는다. multer 기본값은
// 텍스트 필드와 파트 수가 무제한이고 필드 하나에 1 MiB까지 req.body에
// 쌓으므로, 모든 한도를 정해 다른 파트를 메모리에 쌓기 전에 거절한다.
// fields가 0이라 fieldSize는 쓰이지 않지만, 설정이 바뀌어도 상한이 남도록
// 작게 둔다.
function uploadLimits(rule: ImageRule) {
  return {
    fileSize: rule.maxBytes,
    files: 1,
    fields: 0,
    parts: 1,
    fieldSize: 1024,
    fieldNameSize: 100,
    headerPairs: 20,
  };
}

// multer가 거절한 업로드(크기 초과는 413, 다른 한도와 형식 오류는 영어 문구의
// 400)는 클라이언트에게 모두 이미지가 유효하지 않은 한 경우다. 그래서 형식이
// 틀렸을 때와 같은 400 문구를 준다. multer 오류는 핸들러를 부르기 전의
// await에서만 나오므로, 핸들러나 서비스가 던진 오류는 바꾸지 않는다.
function imageInterceptor(rule: ImageRule): Type<NestInterceptor> {
  const Multer = FileInterceptor('image', { limits: uploadLimits(rule) });
  return class ImageInterceptor extends Multer {
    override async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<unknown>> {
      try {
        return await super.intercept(context, next);
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() < 500) {
          throw new BadRequestException(rule.invalidMessage);
        }
        throw error;
      }
    }
  };
}

export function ImageUpload(kind: ImageKind): MethodDecorator {
  return UseInterceptors(imageInterceptor(IMAGE_RULES[kind]));
}

export function UploadedImage(kind: ImageKind): ParameterDecorator {
  return UploadedFile(new ParseImagePipe(IMAGE_RULES[kind]));
}
