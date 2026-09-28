# Approved Preview origin addition

User explicitly confirmed adding the exact Preview origin while preserving existing origins and database.

Project: `twsdtfotrkljgbfsrmgz`. Only updated Edge secret/config `ALLOWED_ORIGINS`; before/after secret digests confirmed no other existing key changed. No database writes, migration, Edge code deployment, production frontend deployment or authentication test performed.

Recovered the previous comma-separated value from the relevant historical configuration command, then verified its SHA-256 against the live digest immediately before updating. Aborted-on-drift guard was used.

Preserved in original order:

- https://localens-ashen.vercel.app
- https://localens-git-codex-thesis-release-final-local-lens2.vercel.app
- https://localens-p1krh66ck-local-lens2.vercel.app

Appended only:

- https://localens-jnkdacj1j-local-lens2.vercel.app

Old digest: `caac5a218c7c9b24cfb51726d5746b5bb5315d2239acb3b6568f413edea17eb5`.
New digest verified: `2dce53256bfcb6a3a912e67e22805ce8167b398fbf0b317d9424fa6c535e2529`.

Live read-only OPTIONS verification for research-planner: all four exact origins return 204 and their own Access-Control-Allow-Origin; https://unapproved.example remains 403 without an allowed origin. No wildcard added. This clears the observed CORS blocker only; it does not certify authenticated generation, persistence or submission. Existing full-suite failures and Preview-only release boundary remain unchanged.
