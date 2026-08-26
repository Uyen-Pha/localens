# Recommend-itinerary handler contract

`supabase/functions/_shared/recommend-itinerary.ts` is the HTTP contract
scaffold for the future public personalized-tour recommendation operation. It
is not a Supabase Function entrypoint and is not deployed or connected to a
live database, AI provider, Turnstile, or payment provider.

## Boundary

The handler performs the following sequence:

1. `guardRequest` enforces the configured origin allowlist, `POST`/`OPTIONS`,
   JSON content type, correlation ID, and body limit.
2. `readJsonBody` reads the actual UTF-8 body and the strict DTO requires
   `{ input, turnstileToken, guestToken? }` with no extra fields.
3. An optional `Authorization: Bearer ...` header is syntax-parsed by
   `requireBearerToken`, then passed to the adapter's mandatory
   `verifyAccessToken` method. A missing header is allowed because
   recommendation is a public operation; the adapter must still validate the
   Turnstile and optional guest capability. The resolver receives only the
   verified principal, never the parse-only token.
4. The injected adapter resolves only an authoritative internal snapshot. The
   handler parses that result with `parseEngineInput` and rejects it if the
   resolved request differs from the submitted request.
5. `recommendItinerary` performs candidate filtering, ranking-provider
   isolation, time/opening-hours scheduling, money arithmetic, and result
   validation. A malformed or forged provider ID degrades to the deterministic
   result and is never returned.
6. The response contains an advisory proposal and `advisoryOnly: true`. It
   intentionally contains no plan ID, quote, booking, checkout session, or
   payment action.

## Adapter obligations

An eventual adapter implementation must:

- verify Turnstile action/hostname and guest capability server-side without
  logging raw tokens;
- implement `verifyAccessToken` with signature, expiry, issuer, audience, and
  session/revocation checks appropriate to the auth provider; a syntactically
  valid Bearer value is not an identity;
- derive catalog, travel, and FX snapshots from approved internal data only;
- apply quota/rate-limit and snapshot policy using the approved DB boundary;
- return the exact `EngineInput` shape or one of the registered adapter error
  codes; never pass provider payloads or user-controlled place objects through;
- keep any AI ranker behind the `Ranker` interface. The ranker may order
  allowlisted candidate IDs and provide short rationales only; it cannot set
  prices, durations, opening hours, totals, or booking state.

## Error surface

All failures use the gateway envelope:

```json
{
  "code": "INVALID_REQUEST",
  "messageKey": "gateway.invalid_request",
  "fieldErrors": { "input.durationMinutes": "itinerary.input.invalid" },
  "retryable": false,
  "correlationId": "..."
}
```

The handler maps adapter failures to stable public statuses and does not copy
adapter detail into the response. Domain failures such as an infeasible
itinerary are returned as `422`; unavailable catalog/travel/FX dependencies
are retryable `503` responses. The client translates `messageKey` into EN/VI.

## Runtime gate still required

Before adding `supabase/functions/recommend-itinerary/index.ts` or calling a
private RPC, the project still needs the approved internal DB credential/public
wrapper, Turnstile verifier, quota transaction, and a container-backed Task 16
runtime test. The current file is therefore a tested contract boundary, not
evidence that a live recommendation endpoint exists.
