import { Module } from '@nestjs/common';
import { OmeModule } from '../ome/ome.module.js';
import {
  DEFAULT_RECONCILE_INTERVAL_MS,
  RECONCILE_INTERVAL_MS,
  RecordingReconciler,
} from './recording-reconciler.js';
import {
  RECORDINGS_CONFIG,
  recordingsConfigFromEnv,
} from './recordings-config.js';

@Module({
  imports: [OmeModule],
  providers: [
    RecordingReconciler,
    {
      provide: RECORDINGS_CONFIG,
      useFactory: () => recordingsConfigFromEnv(process.env),
    },
    {
      provide: RECONCILE_INTERVAL_MS,
      useValue: DEFAULT_RECONCILE_INTERVAL_MS,
    },
  ],
})
export class RecordingsModule {}
