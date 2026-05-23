import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, type Express, urlencoded } from 'express';

const parseTrustProxy = (): boolean | number | string => {
  const value = process.env['TRUST_PROXY'];

  if (!value || value === 'false') return false;
  if (value === 'true') return true;

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : value;
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const corsOrigin = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173';
  const bodyLimit = process.env['JSON_BODY_LIMIT'] ?? '1mb';

  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.set('trust proxy', parseTrustProxy());
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env['NODE_ENV'] === 'production' ? undefined : false,
    }),
  );
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,

      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env['NODE_ENV'] !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Presupuestados API')
      .setDescription('The Presupuestados API description')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, documentFactory);
  }

  await app.listen(process.env['PORT'] ?? 3000);
}
void bootstrap();
