import { Module } from '@nestjs/common';
import {
  ImageStore,
  THUMBNAILS_DIR,
  thumbnailsDirFromEnv,
} from './image-store.js';

// One store and one folder for every uploaded image: broadcast thumbnails
// and channel standby images share the /thumbnails static server.
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
