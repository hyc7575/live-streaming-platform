import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp, sessionSettingsFromEnv } from './configure-app.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
configureApp(app, sessionSettingsFromEnv());
app.enableShutdownHooks();
await app.listen(Number(process.env.API_PORT || 3000));
