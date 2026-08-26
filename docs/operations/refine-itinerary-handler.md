# Refine-itinerary handler contract

`supabase/functions/_shared/refine-itinerary.ts` is a tested contract scaffold
for the public personalized-itinerary refinement operation. It is not a
Supabase Function entrypoint and is not deployed or connected to a live DB,
AI provider, authentication provider, or payment provider.

## Request boundary

The exact JSON body is:

```json
{
  "planId": "UUID",
  "baseRevision": 3,
  "delta": {
    "feedback": "More history, please",
    "scope": "partial"
  },
  "lockedItemIds": ["UUID"],
  "guestToken": "optional-opaque-capability"
}
```

`scope` is `partial` or `full`. Feedback is trimmed, bounded, and rejected
when it contains control characters. `planId`, `baseRevision`, and locked
item IDs are validated before any adapter call; extra body fields are rejected.

## Auth, preparation, and CAS

1. The shared gateway enforces origin, method, JSON content type, body size,
   correlation ID, and the common error envelope.
2. The handler syntax-parses an optional Bearer header, then requires the
   adapter's `verifyAccessToken` to produce a server-verified principal. It
   never passes the parse-only token to plan loading or quota logic.
3. Without a principal, a guest token is required and must pass the adapter's
   `verifyGuestCapability(planId, token, correlationId)`. Only the verified
   plan-bound capability crosses into preparation/commit.
4. `prepareRefinement` must load the current plan and its catalog/travel/FX
   snapshots through an approved internal boundary. It returns the current
   revision, a normalized copy of `delta`, and a canonical previous-revision
   context. It includes the previous fingerprint, all snapshot IDs, and each
   submitted locked item mapped to its authoritative internal `placeId`,
   position, start/end times, and visit duration. Unknown, duplicate, or
   not-owned locks are rejected safely; a revision mismatch returns `409
   STALE_REVISION`.
5. The existing domain engine computes the proposal. The adapter may provide
   a ranker, but it receives feedback, scope, and canonical locked place IDs as
   advisory context and may order only allowlisted candidate IDs; the engine
   owns opening hours, travel transitions, durations, totals, and budget checks.
6. Before commit, every locked place must occur exactly once, in previous lock
   order, with the same timing and visit duration. This applies to partial
   refinement and full regeneration when locks are present; full regeneration
   with no locks is unrestricted. `commitRefinement` receives the normalized
   delta and canonical previous context, then must revalidate the complete
   result against the same snapshots and perform a transactional
   compare-and-swap. A successful commit advances exactly one revision; a race
   returns `409 STALE_REVISION`.

The response has `advisoryOnly: true` and contains the proposal/revision only.
It never creates or mutates booking, quote, checkout, or payment state.

## Adapter obligations and runtime gate

The eventual adapter must validate all internal plan/item/place IDs, guest
expiry/ownership, snapshot membership, opening hours, travel data, budget,
duration, and authoritative totals before persistence. It must hash or verify
opaque capabilities without logging tokens and preserve the existing DB lock
order/CAS policy.

Before adding `supabase/functions/refine-itinerary/index.ts`, the project still
needs the approved internal DB wrapper/credential and the container-backed
Task 16 runtime tests for RLS, locks, CAS, and concurrent refinement. This
scaffold is not evidence that those runtime guarantees are live.
