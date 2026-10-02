import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export function sendError(res: Response, status: number, code: string, message: string): void {
  const body: ApiErrorBody = { error: { code, message } };
  res.status(status).json(body);
}

export function zodErrorMessage(err: ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;
  if (err instanceof ZodError) {
    sendError(res, 400, "INVALID_REQUEST", zodErrorMessage(err));
    return;
  }
  if (err instanceof SyntaxError && "body" in (err as object)) {
    sendError(res, 400, "INVALID_JSON", "Request body is not valid JSON");
    return;
  }
  sendError(res, 500, "INTERNAL_ERROR", "Unexpected server error");
}
