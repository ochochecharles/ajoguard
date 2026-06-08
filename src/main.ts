import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, BadRequestException, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.useLogger(logger);

  app.enableCors({
    origin: 'http://localhost:5173',
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
          Object.values(error.constraints || {}).join(', ')
        );
        return new BadRequestException(messages);
      },
    }),
  );

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('AjoGuard API')
    .setDescription('Backend reconciliation engine for informal savings groups')
    .setVersion('1.0')
    .addTag('groups', 'Manage savings groups')
    .addTag('members', 'Manage group members')
    .addTag('contributions', 'View contribution records')
    .addTag('ingest', 'Receive contributions from all channels')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  console.log(`AjoGuard running on port ${process.env.PORT ?? 3000}`);
  console.log(`Swagger UI available at http://localhost:3000/api`);
}
bootstrap();
