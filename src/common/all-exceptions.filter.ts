import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

interface ErrorResponseBody {
  success: false;
  statusCode: number;
  message: string;
  error?: string;
  requestId: string;
  timestamp: string;
  path?: string;
  stack?: string;
}

/**
 * Produces a single, consistent JSON envelope for every error response:
 * { success, statusCode, message, error, requestId, timestamp, path }.
 *
 * - ValidationPipe's BadRequestException may carry an array message; we
 *   flatten it to a single string for a uniform `message` field.
 * - Stack traces are only included in development.
 * - Every response is tagged with a requestId for tracing.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = (request.headers['x-request-id'] as string) ||
      randomUUID();

    const isDev = process.env.NODE_ENV !== 'production';
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string;
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (Array.isArray((body as { message?: unknown }).message)) {
        message = (body as { message: string[] }).message.join(', ');
      } else {
        message = (body as { message?: string }).message ?? exception.message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    } else {
      message = 'Internal server error';
    }

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${statusCode}: ${
          exception instanceof Error ? exception.stack : exception
        }`,
      );
    }

    const body: ErrorResponseBody = {
      success: false,
      statusCode,
      message,
      requestId,
      timestamp: new Date().toISOString(),
    };

    if (isDev) {
      body.path = request.url;
      if (
        statusCode >= 500 &&
        exception instanceof Error &&
        exception.stack
      ) {
        body.stack = exception.stack;
      }
    }

    if (exception instanceof HttpException && typeof exception.getResponse() !== 'string') {
      const responseBody = exception.getResponse() as { error?: string };
      if (responseBody.error) {
        body.error = responseBody.error;
      }
    }

    response
      .status(statusCode)
      .setHeader('X-Request-Id', requestId)
      .json(body);
  }
}