import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { Env } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  const port = app.get(ConfigService<Env, true>).get('PORT');
  await app.listen(port);
  Logger.log(`Seatly API listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
