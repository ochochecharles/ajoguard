import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, BadRequestException, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

function parseCorsOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.useLogger(logger);

  // Security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
  // HSTS, CSP, etc. CSP allows 'unsafe-inline' so the OAuth callback page can
  // inject the JWT into an inline <script>.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
    }),
  );

  const devOrigins = ['http://localhost:3000', 'http://localhost:5173'];
  const allowedOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : devOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const messages = errors.map((error) =>
          Object.values(error.constraints || {}).join(', '),
        );
        return new BadRequestException(messages);
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger setup — exposed only when explicitly enabled (off by default in production).
  // Set SWAGGER_ENABLED=true to force it on; defaults to on outside production.
  const enableSwagger =
    process.env.SWAGGER_ENABLED !== undefined
      ? ['true', '1', 'yes'].includes(process.env.SWAGGER_ENABLED.toLowerCase())
      : process.env.NODE_ENV !== 'production';

  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('AjoGuard API')
      .setDescription(
        'Backend reconciliation engine for informal savings groups',
      )
      .setVersion('1.0')
      .addTag('groups', 'Manage savings groups')
      .addTag('members', 'Manage group members')
      .addTag('contributions', 'View contribution records')
      .addTag('ingest', 'Receive contributions from all channels')
      .addTag('health', 'Liveness and readiness probes')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
    console.log(`Swagger UI available at http://localhost:3000/api`);
  }

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  console.log(`AjoGuard running on port ${process.env.PORT ?? 3000}`);
}

void bootstrap();
