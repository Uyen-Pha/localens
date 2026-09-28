# Six-tour Preview origin — approved configuration update

User explicitly approved adding the new Preview domain while preserving existing origins and database.

- Project: `twsdtfotrkljgbfsrmgz`.
- Appended only `https://localens-8nqgxegxd-local-lens2.vercel.app` to `ALLOWED_ORIGINS`.
- Preserved all four existing origins, in the same order: production `localens-ashen`, branch Preview `localens-git-codex-thesis-release-final-local-lens2`, Preview `localens-p1krh66ck-local-lens2`, Preview `localens-jnkdacj1j-local-lens2` (all on vercel.app).
- Verified the previous exact value against its live SHA-256 before writing; abort-on-drift guard passed. New digest: `b82b6be6ad67e70f257ffd0c87fc9dec4092fe28010f326a48d5785c613b52ee`. Other existing secret digests unchanged.
- Live read-only research-planner OPTIONS: all five approved origins returned 204 with matching Access-Control-Allow-Origin. `https://unapproved.example` still returned 403 without that header. No wildcard.
- No database, migration, Edge code deployment, frontend deployment, production promotion or account change. This supersedes the CORS blocker in the home/six-tour Preview report, not its other limitations.
- This verifies browser-origin permission only; no authenticated generation, itinerary adjustment or request submission was performed. Do not infer those flows are now fully accepted.
