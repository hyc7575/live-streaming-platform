import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';

const app = await NestFactory.create(AppModule);
configureApp(app);
await app.listen(Number(process.env.API_PORT || 3000));
