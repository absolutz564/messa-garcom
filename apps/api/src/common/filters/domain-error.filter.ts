import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { DomainError } from '@messa/domain';
import { DOMAIN_ERROR_STATUS, type ApiError } from '@messa/contracts';
import { ZodError } from 'zod';
import { currentContext } from '../request-context';

/** Converte DomainError / ZodError / HttpException para o formato ApiError. */
@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const requestId = currentContext()?.requestId;
    let body: ApiError;

    if (exception instanceof DomainError) {
      body = {
        statusCode: DOMAIN_ERROR_STATUS[exception.code] ?? 400,
        code: exception.code,
        message: exception.message,
        details: exception.details,
        requestId,
      };
    } else if (exception instanceof ZodError) {
      body = {
        statusCode: 422,
        code: 'validation',
        message: 'Dados inválidos',
        details: { issues: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
        requestId,
      };
    } else if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const obj = typeof res === 'object' && res !== null ? (res as Record<string, unknown>) : {};
      body = {
        statusCode: exception.getStatus(),
        code: (obj.code as string) ?? (obj.error as string)?.toLowerCase().replace(/\s+/g, '_') ?? 'http_error',
        message: (obj.message as string) ?? exception.message,
        requestId,
      };
    } else {
      // eslint-disable-next-line no-console
      console.error(exception);
      body = { statusCode: 500, code: 'internal', message: 'Erro interno', requestId };
    }

    // Endpoints binários (QR, imagens) fixam Content-Type via @Header; o erro é sempre JSON.
    reply.status(body.statusCode).header('content-type', 'application/json; charset=utf-8').send(body);
  }
}
