import { Module } from '@nestjs/common';
import { HttpOmeApi, OME_API, omeApiConfigFromEnv } from './ome-api.js';

@Module({
  providers: [
    {
      provide: OME_API,
      useFactory: () => new HttpOmeApi(omeApiConfigFromEnv(process.env)),
    },
  ],
  exports: [OME_API],
})
export class OmeModule {}
