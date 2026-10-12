import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { Env } from './config/env.validation';

/** Everything that must be applied to the Nest app in both main.ts and e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<Env, true>);
  app.use(cookieParser());
  app.enableCors({ origin: config.get('WEB_ORIGIN'), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Seatly API')
    .setDescription('Seat booking playground')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
}
