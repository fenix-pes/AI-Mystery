# AI generation

The backend uses Google's official `@google/genai` SDK. `GEMINI_MODEL`, `GEMINI_API_KEY`, request timeout, attempt count, and repair count are environment configuration; model IDs are not scattered through the application.

The current pipeline has three server-side requests:

1. Plan the incident, suspects, canonical solution, timeline, and clue IDs.
2. Generate evidence tied to those already approved IDs and facts.
3. Ask for an independent structured consistency review.

Zod parses the structured responses. Runtime validation then checks identifier uniqueness, culprit membership, evidence and timeline references, target counts by difficulty, and at least two decisive clues. A failed attempt is not published. Prompt templates are versioned in `server/src/prompts/`.

The image provider is optional and defaults to `none`. When `IMAGE_PROVIDER=gemini`, the server uses the configured Gemini image model for up to three fictional image/CCTV evidence items and stores the result through the local storage adapter. Assets are served only after checking case ownership. Missing keys or provider failures leave the text evidence available.
