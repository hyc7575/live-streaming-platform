import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp, sessionSettingsFromEnv } from './configure-app.js';

// OME 웹훅 서명은 요청 바이트를 그대로 대상으로 한다.
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  rawBody: true,
});
configureApp(app, sessionSettingsFromEnv());
app.enableShutdownHooks();
await app.listen(Number(process.env.API_PORT || 3000));
