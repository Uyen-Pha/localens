# LocalLens Edge Gateway boundary

`supabase/functions/_shared/gateway.ts` is the first shared HTTP boundary for
LocalLens Edge Functions. It is deliberately Web Platform-only so the same
helpers can run in Supabase Edge/Deno and in the repository's unit tests.

The module currently provides:

- explicit-origin CORS validation and preflight responses;
- method and JSON content-type gates;
- a 64 KiB default request-body limit, checked from both `Content-Length` and
  the actual UTF-8 bytes read from the request;
- internally generated correlation IDs;
- strict `Bearer` authorization parsing;
- the stable error envelope:

  ```json
  {
    "code": "INVALID_REQUEST",
    "messageKey": "gateway.invalid_request",
    "fieldErrors": {},
    "retryable": false,
    "correlationId": "..."
  }
  ```

- bounded, redacted logging helpers.

## Public client versus Edge-only client

The browser may use the Supabase publishable key and the signed-in user's JWT
for public-schema projections and authenticated public RPCs. The browser must
not use a service-role key, query the `private` schema, or send provider
secrets, raw guest tokens, Stripe signatures, or request bodies to logs.

An Edge Function may hold Edge-only secrets, including a service-role key, but
this shared module does not create that client and does not grant it authority.
Service-role access must remain behind a function-specific adapter that
revalidates the input and calls only the intended operation.

## Current database limitation

The repository contains private functions such as checkout and Stripe webhook
finalizers, but the current migration set does not expose public wrappers for
all of them. Several operations are granted only to named internal roles, and
some of those roles are `NOLOGIN`. Therefore this gateway does **not** claim
that private RPCs are callable yet.

Before implementing a production function for guest-plan creation, checkout,
or Stripe webhooks, a later migration must define and test the internal call
boundary. It must choose either narrowly protected public wrappers or a
dedicated Edge-only database connection/credential. That work must preserve
RLS, actor derivation, idempotency, lock order, and the existing grant matrix.

There is intentionally no recommendation, AI, checkout, or webhook function
in this change. The absence of `supabase/functions/<name>/index.ts` means those
features remain unimplemented rather than simulated as live backend behavior.

## Function handler order

Each future public handler should follow this order:

1. Call `guardRequest(request, policy, correlationIdFactory)`.
2. Return its response immediately for CORS, method, content-type, or size
   failures; return the 204 response for a valid preflight.
3. Call `readJsonBody` with the returned correlation ID and CORS headers.
4. Validate the endpoint-specific DTO with its own strict schema.
5. Call `requireBearerToken` only for an authenticated operation.
6. Call a function-specific public RPC or approved internal adapter.
7. Return `jsonResponse` or `errorResponse`; use `safeLog` only with bounded
   metadata such as event code and correlation ID.

The gateway envelope contains message keys, not localized text. The client is
responsible for translating `messageKey` in English or Vietnamese.
