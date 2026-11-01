import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const correlationId = response.locals.correlationId as string | undefined;
  console.error("Unhandled request error", { correlationId, name: error instanceof Error ? error.name : "UnknownError" });
  const rawStatus = Number.isInteger((error as { status?: number })?.status) ? (error as { status: number }).status : 500;
  const status = rawStatus === 400 || rawStatus === 413 ? rawStatus : 500;
  const code = status === 413 ? "REQUEST_TOO_LARGE" : status === 400 ? "VALIDATION_ERROR" : "INTERNAL_SERVER_ERROR";
  const message = status === 413 ? "The request is too large." : status === 400 ? "The supplied request is invalid." : "Something went wrong. Please try again.";
  response.status(status).json({
    success: false,
    error: { code, message, correlationId }
  });
};
