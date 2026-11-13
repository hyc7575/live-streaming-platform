import { Module } from '@nestjs/common';
import {
  ImageStore,
  THUMBNAILS_DIR,
  thumbnailsDirFromEnv,
} from './image-store.js';

// 업로드 이미지 전부가 저장소 하나와 폴더 하나를 쓴다. 방송 썸네일과
// 채널 기본 대기 이미지가 /thumbnails 정적 서버를 함께 쓴다.
@Module({
  providers: [
    ImageStore,
    {
      provide: THUMBNAILS_DIR,
      useFactory: () => thumbnailsDirFromEnv(process.env),
    },
  ],
  exports: [ImageStore],
})
export class ImagesModule {}
