# Data model

MongoDB stores guest sessions, mystery cases, investigation progress, and accusations in separate collections. A guest session stores an HMAC of its random token and an expiry date. Cases store their canonical solution and internal clue roles, which are removed by the case API's public serializers. Progress embeds the owner's notes and reviewed evidence IDs. Accusations have a unique `(caseId, ownerId)` index.

The model definitions are in `server/src/models/`. Generated case payloads are parsed and semantically checked before being persisted as `ready`.
