import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SentryExceptionCaptured } from '@sentry/nestjs';
import { ErrorAlertService } from './error-alert.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly errorAlert: ErrorAlertService) {}

  @SentryExceptionCaptured()
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const response = http.getResponse();
    const request = http.getRequest<{
      method?: string;
      url?: string;
      userId?: string;
    }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode: status,
            message: 'Erro interno do servidor',
          };

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        `Erro não tratado em ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response
      .status(status)
      .json(
        typeof payload === 'string'
          ? { statusCode: status, message: payload }
          : payload,
      );

    this.errorAlert.notify({
      status,
      method: request.method ?? 'UNKNOWN',
      path: request.url ?? '/',
      userId: request.userId,
      userMessage: this.extractUserMessage(payload, status),
      cause: this.extractCause(exception),
    });
  }

  private extractUserMessage(payload: string | object, status: number): string {
    if (typeof payload === 'string') {
      return payload;
    }

    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message = (payload as { message?: string | string[] }).message;
      if (Array.isArray(message)) {
        return message.join(', ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }

    return `HTTP ${status}`;
  }

  private extractCause(exception: unknown): string {
    if (exception instanceof HttpException && exception.cause) {
      return this.stringifyCause(exception.cause);
    }

    return this.stringifyCause(exception);
  }

  private stringifyCause(error: unknown): string {
    if (error instanceof Error) {
      const stack = error.stack
        ? `\n${error.stack.split('\n').slice(0, 8).join('\n')}`
        : '';
      return `${error.name}: ${error.message}${stack}`;
    }

    return String(error);
  }
}
