# Architecture

## Request flow

The React client talks to the Express API using one credentialed API client. The API creates a random guest token, stores only its HMAC hash in MongoDB, and places the token in an HttpOnly, SameSite cookie. Case and progress queries always resolve ownership from that session.

## Mystery generation

1. Validate and queue the submitted scenario.
2. Ask Gemini for a plan with one canonical culprit, suspects, chronology, and planned clues.
3. Ask Gemini for evidence tied to those approved clue IDs.
4. Check identifier uniqueness, references, difficulty counts, culprit membership, and decisive clue support.
5. Run a separate structured consistency review for unique solvability, support, contradictions, and completeness.
6. Publish only after validation passes. Otherwise mark the case failed with a safe error code.

The canonical solution and clue classifications are server-side fields. `server/src/modules/cases/router.ts` owns public serialization, verdict evaluation, and result disclosure.

## Data ownership

`GuestSession`, `MysteryCase`, `InvestigationProgress`, and `Accusation` are separate MongoDB models. Cases, progress, and accusations are always queried using the session owner ID. A unique compound index enforces one accusation per case and owner.

## Images and current boundaries

Image evidence is optional. When `IMAGE_PROVIDER=gemini`, the server generates up to three fictional image/CCTV assets in the background, stores them under a private local uploads directory, and serves them only through an owner-checked asset route. Image errors leave the text evidence available. Object storage, registered accounts, and collaborative play are not implemented. The MongoDB and Gemini services must be configured before real cases can be generated.
