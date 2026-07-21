import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';
import * as Sentry from '@sentry/node';

/** Reports unexpected (5xx / non-HttpException) errors to Sentry, then
 * rethrows unchanged so Nest's normal exception filters still produce the
 * exact same HTTP response as before — this is observation only, never
 * response formatting. No-ops entirely when SENTRY_DSN isn't configured. */
@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err) => {
        const status = err instanceof HttpException ? err.getStatus() : 500;
        if (process.env.SENTRY_DSN && status >= 500) {
          Sentry.captureException(err);
        }
        return throwError(() => err);
      }),
    );
  }
}
