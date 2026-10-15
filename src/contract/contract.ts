import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import * as OpenApiValidator from 'express-openapi-validator';
import { NextFunction, Request, Response } from 'express';
import { parse } from 'yaml';

/** Absolute path of the hand-authored API contract. Also the file the frontend generates its types from. */
export const CONTRACT_PATH = join(__dirname, '..', '..', 'contracts', 'openapi.yaml');

export function loadContract(): OpenAPIObject {
  return parse(readFileSync(CONTRACT_PATH, 'utf8')) as OpenAPIObject;
}

export const CONTRACT_VIOLATION = 'CONTRACT_VIOLATION';

/**
 * Validate every HTTP response against the contract (used by the e2e suite only).
 * Request validation stays with Nest's ValidationPipe so error bodies are unchanged;
 * a response that does not match the contract becomes a 500 CONTRACT_VIOLATION,
 * which makes the e2e test that triggered it fail with the schema error in the body.
 *
 * Call before app.init(); afterwards call attachContractErrorHandler(app).
 */
export function enableContractValidation(app: INestApplication): void {
  app.use(
    OpenApiValidator.middleware({
      apiSpec: CONTRACT_PATH,
      validateRequests: false,
      validateSecurity: false, // guards stay Nest's job so 401 bodies are unchanged
      validateResponses: true,
      // Unknown routes must still produce Nest's 404 envelope; coverage of the contract is
      // asserted positively by test/contract.e2e-spec.ts via listHttpRoutes().
      ignoreUndocumented: true,
      ignorePaths: /^\/docs/,
    }),
  );
}

export function attachContractErrorHandler(app: INestApplication): void {
  const express = app.getHttpAdapter().getInstance() as {
    use: (handler: (err: unknown, req: Request, res: Response, next: NextFunction) => void) => void;
  };
  express.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    const error = err as { status?: number; message?: string; errors?: unknown; path?: string };
    res.status(500).json({
      statusCode: 500,
      code: CONTRACT_VIOLATION,
      message: `Response does not match contracts/openapi.yaml: ${error.message ?? String(err)}`,
      details: { path: error.path, errors: error.errors ?? [] },
    });
  });
}

export interface HttpRoute {
  method: string;
  /** Express pattern, e.g. /events/:eventId */
  path: string;
}

interface ExpressLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Every HTTP route Nest registered on the Express adapter (Swagger UI routes excluded). */
export function listHttpRoutes(app: INestApplication): HttpRoute[] {
  const express = app.getHttpAdapter().getInstance() as {
    router?: { stack: ExpressLayer[] };
    _router?: { stack: ExpressLayer[] };
  };
  const stack = express.router?.stack ?? express._router?.stack ?? [];
  return stack
    .filter((layer): layer is Required<ExpressLayer> => Boolean(layer.route))
    .flatMap((layer) =>
      Object.keys(layer.route.methods)
        .filter((method) => method !== '_all')
        .map((method) => ({ method: method.toUpperCase(), path: layer.route.path })),
    )
    .filter((route) => !route.path.startsWith('/docs'));
}

/** Express-style path for an OpenAPI path template: /events/{eventId} -> /events/:eventId */
export function toExpressPath(openApiPath: string): string {
  return openApiPath.replace(/\{([^}]+)\}/g, ':$1');
}
