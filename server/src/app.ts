import cors from "cors";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { env } from "./config/env.js";
import { databaseStatus } from "./config/database.js";
import { errorHandler } from "./middleware/error-handler.js";
import { casesRouter } from "./modules/cases/router.js";
import { sessionRouter } from "./modules/auth/session.js";

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use((_request, response, next) => {
  const correlationId = randomUUID();
  response.locals.correlationId = correlationId;
  response.setHeader("X-Correlation-ID", correlationId);
  next();
});
app.use(express.json({ limit: "32kb" }));
app.use("/api/v1", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => response.status(429).json({ success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Please wait and try again.", correlationId: response.locals.correlationId } })
}));

app.get("/api/v1/health", (_request, response) => {
  response.json({
    success: true,
    data: { status: "ok", database: databaseStatus(), version: "1.0.0" },
    message: "Service health retrieved"
  });
});

app.use("/api/v1/session", sessionRouter());
app.use("/api/v1/cases", casesRouter);

app.use("/api", (_request, response) => {
  response.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "The requested resource was not found.", correlationId: response.locals.correlationId } });
});

if (env.NODE_ENV === "production") {
  const clientDist = path.resolve(process.cwd(), "../client/dist");
  app.use(express.static(clientDist, { index: false }));
  app.get("*", (_request, response, next) => {
    response.sendFile(path.join(clientDist, "index.html"), error => {
      if (error) next(error);
    });
  });
}

app.use((_request, response) => {
  response.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "The requested resource was not found.", correlationId: response.locals.correlationId } });
});

app.use(errorHandler);
