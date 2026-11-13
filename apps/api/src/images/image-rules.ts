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

// The magic bytes decide the format, never the name or Content-Type the
// client claims. The extension is the server's, used in the stored file name.
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
  // PRD-mypage 7.2: the profile image takes the standby image's rule as is.
  avatar: USER_IMAGE_RULE,
} as const satisfies Record<string, ImageRule>;

export type ImageKind = keyof typeof IMAGE_RULES;

export interface ParsedImage {
  format: ImageFormat;
  bytes: Buffer;
}

// The part of a multer file this module reads. @types/multer is not a
// dependency.
interface MulterFile {
  buffer: Buffer;
}

// Multer reports an oversized file as 413. To a client it is one more way the
// image is invalid, so it gets the same 400 as a wrong format.
@Catch(PayloadTooLargeException)
class FileTooLargeFilter implements ExceptionFilter {
  constructor(private readonly message: string) {}

  catch(_error: PayloadTooLargeException, host: ArgumentsHost): void {
    const body = new BadRequestException(this.message).getResponse();
    host.switchToHttp().getResponse<Response>().status(400).json(body);
  }
}

// A missing file covers both a multipart body without the `image` field and
// a body that is not multipart at all.
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
