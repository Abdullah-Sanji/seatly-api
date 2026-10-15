import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { Env } from './config/env.validation';
import { AppExceptionFilter } from './common/filters/app-exception.filter';
import { loadContract } from './contract/contract';

/** Everything that must be applied to the Nest app in both main.ts and e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<Env, true>);
  app.use(cookieParser());
  app.enableCors({ origin: config.get('WEB_ORIGIN'), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AppExceptionFilter());

  // Swagger UI serves the hand-authored contract, not decorator-generated docs: /docs is the contract.
  SwaggerModule.setup('docs', app, loadContract());
}
