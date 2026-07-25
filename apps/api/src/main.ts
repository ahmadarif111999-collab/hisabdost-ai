import {
  ValidationPipe,
} from '@nestjs/common';
import {
  ConfigService,
} from '@nestjs/config';
import {
  NestFactory,
} from '@nestjs/core';
import {
  AppModule,
} from './app.module';

function normalizeOrigin(
  value?: string,
) {
  return String(value || '')
    .trim()
    .replace(/\/$/, '');
}

async function bootstrap() {
  const app =
    await NestFactory.create(
      AppModule,
    );

  const config =
    app.get(ConfigService);

  const configuredOrigins = [
    config.get<string>(
      'FRONTEND_URL',
    ),
    ...String(
      config.get<string>(
        'FRONTEND_URLS',
      ) || '',
    ).split(','),
  ]
    .map(normalizeOrigin)
    .filter(Boolean);

  const allowedOrigins =
    new Set([
      ...configuredOrigins,
      'https://hisabdost-ai-web.vercel.app',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);

  app.enableCors({
    origin: (
      requestOrigin:
        | string
        | undefined,
      callback: (
        error: Error | null,
        allow?: boolean,
      ) => void,
    ) => {
      if (!requestOrigin) {
        callback(null, true);
        return;
      }

      const origin =
        normalizeOrigin(
          requestOrigin,
        );

      const exactMatch =
        allowedOrigins.has(origin);

      const hisabDostPreview =
        /^https:\/\/hisabdost-ai-web(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(
          origin,
        );

      callback(
        null,
        exactMatch ||
          hisabDostPreview,
      );
    },
    credentials: true,
    methods: [
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
    ],
    optionsSuccessStatus: 204,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  const port =
    config.get<number>('PORT') ||
    4000;

  await app.listen(
    port,
    '0.0.0.0',
  );

  console.log(
    `HisabDost API running on port ${port}`,
  );
}

void bootstrap();
