import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Redacted structured log
  console.error(`[ERROR] ${req.method} ${req.url} ->`, err?.message || err);

  if (err instanceof ZodError || err?.name === 'ZodError') {
    res.status(400).json({
      error: 'Validation failed',
      issues: (err.issues || []).map((i: any) => ({
        path: Array.isArray(i.path) ? i.path.join('.') : String(i.path),
        message: i.message,
      })),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
    return;
  }

  // Postgres unique violation error
  if (err?.code === '23505') {
    res.status(409).json({
      error: 'A record with the specified unique values already exists',
      detail: err.detail,
    });
    return;
  }

  res.status(500).json({
    error: 'Internal server error',
  });
}
