import { createHmac, randomBytes } from "node:crypto";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { GuestSession } from "../../models/GuestSession.js";
import { env } from "../../config/env.js";

const cookieName = "mystery_session";
const lifetimeMs = 1000 * 60 * 60 * 24 * 30;
const tokenHash = (token: string) => createHmac("sha256", env.SESSION_SECRET).update(token).digest("hex");

function readCookie(request: Request, name: string): string | undefined {
  const value = request.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : undefined;
}

export async function ensureGuestSession(request: Request, response: Response): Promise<string> {
  const current = readCookie(request, cookieName);
  if (current) {
    const session = await GuestSession.findOne({ tokenHash: tokenHash(current), expiresAt: { $gt: new Date() } });
    if (session) return session.id;
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + lifetimeMs);
  const session = await GuestSession.create({ tokenHash: tokenHash(token), expiresAt });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.append("Set-Cookie", `${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(lifetimeMs / 1000)}${secure}`);
  return session.id;
}

export interface GuestRequest extends Request { ownerId?: string }

export async function requireGuest(request: GuestRequest, response: Response, next: NextFunction): Promise<void> {
  try {
    const token = readCookie(request, cookieName);
    if (!token) {
      response.status(401).json({ success: false, error: { code: "SESSION_EXPIRED", message: "Your guest session has expired. Start a new session to continue.", correlationId: response.locals.correlationId } });
      return;
    }
    const session = await GuestSession.findOne({ tokenHash: tokenHash(token), expiresAt: { $gt: new Date() } });
    if (!session) {
      response.status(401).json({ success: false, error: { code: "SESSION_EXPIRED", message: "Your guest session has expired. Start a new session to continue.", correlationId: response.locals.correlationId } });
      return;
    }
    request.ownerId = session.id;
    next();
  } catch (error) {
    next(error);
  }
}

export function sessionRouter() {
  const router = Router();
  router.post("/guest", async (request, response, next) => {
    try {
      const id = await ensureGuestSession(request, response);
      response.json({ success: true, data: { sessionType: "guest", sessionId: id }, message: "Guest session ready" });
    } catch (error) { next(error); }
  });
  return router;
}
