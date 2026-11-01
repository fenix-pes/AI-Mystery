# AI Mystery Room

AI Mystery Room is a guest-first detective game. A player supplies a fictional premise, investigates AI-generated evidence, and makes one final accusation. The server fixes the culprit before evidence is generated and keeps the solution private until the accusation is recorded.

## Features

- Responsive React investigation desk with case creation, progress, library, suspects, evidence search and detail, timeline, private notes, accusation, and results.
- Guest sessions stored as hashed tokens and carried in an HttpOnly cookie.
- Gemini generation runs only on the server. It plans the solution first, generates evidence against that plan, validates references and difficulty counts, and asks for an independent consistency review before publication.
- MongoDB persistence for cases, progress, notes, sessions, and accusations.
- Public serializers remove private suspect notes, clue roles, and the canonical solution. A unique database index limits a case to one accusation.
- Graceful handling of generation failures, bounded retries, case-generation limits, API rate limiting, and security headers.

Image generation is optional; account registration is outside the guest-first MVP. When the Gemini image provider is enabled, selected image and CCTV evidence gets a fictional illustration. If it is disabled or fails, the text clue remains available.

## Requirements

- Node.js 20 or newer
- MongoDB 7 or newer, local or hosted
- A Gemini API key for creating real generated cases

## Run locally

1. Copy `.env.example` to `.env`.
2. Set `MONGODB_URI` to a reachable MongoDB database.
3. Set `SESSION_SECRET` to a random secret with at least 32 characters.
4. Set `GEMINI_API_KEY` from Google AI Studio. `GEMINI_MODEL` defaults to `gemini-3.8-flash` and can be changed without code edits.
5. Optionally set `IMAGE_PROVIDER=gemini` to generate up to three image/CCTV assets per case. It uses `IMAGE_PROVIDER_API_KEY` or falls back to `GEMINI_API_KEY`; `IMAGE_MODEL` defaults to `gemini-3.1-flash-image`. Image generation adds provider usage and is not required for play.
6. From the repository root, run `npm install` and `npm run dev`.

The client runs at `http://localhost:5173`; the API runs at `http://localhost:5000`. The client uses `VITE_API_BASE_URL` when set, otherwise it targets `http://localhost:5000/api/v1`. The API health endpoint is `GET /api/v1/health`.

## Commands

- `npm run dev` — start the Vite client and Express API.
- `npm run typecheck` — type-check all workspaces.
- `npm run build` — create production builds for shared, server, and client packages.
- `npm test` — run deterministic mystery validation tests with Node's test runner.

## Structure

- `client/` — React, Vite, React Router, and the responsive investigation UI.
- `server/` — Express API, guest ownership, Mongoose models, Gemini integration, prompts, validation, image adapter, and local asset storage.
- `shared/` — Zod request schemas and shared types.
- `spec.md` — product and implementation source of truth.

## Important security behavior

Never put `GEMINI_API_KEY` in client variables or frontend code. Do not return a case's `solution` from ordinary case, status, suspect, evidence, or timeline endpoints. The result endpoint is available only after the single accusation has been stored. All case and note access is scoped to the current guest session on the server.

The generated fiction should not contain real people's private information. The creation form asks users to submit fictional scenarios only.
