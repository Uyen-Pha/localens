# Guide assignment recovery plan

## Scope

Bring the guide assignment runtime into alignment with UC-ADM07 and the approved guide schedule UI without changing the cancellation, planner, quote-deadline, or unrelated admin surfaces.

## Steps

1. Add focused static and database assertions for fixed `sold_out` departures, accepted personalized quotes with approved valid itineraries, cancellation history, guide scoping, reassignment history, and overlap protection.
2. Add a forward-only Supabase migration that derives a single authoritative time window for fixed and personalized bookings, extends the existing assignment RPC while preserving its public name and idempotency contract, and keeps the existing bounded definer-role model.
3. Extend the admin queue to project both sources and the guide schedule to project both sources, including itinerary summaries and cancelled history while retaining the synthetic demo rows.
4. Keep the approved Calendar/List guide UI and current adapter contract unchanged unless focused tests identify a response-shape defect.
5. Run focused tests, database lint/pgTAP when the local Supabase runtime is available, typecheck, changed-file lint, build, then create the Guide Preview only after verification.

## Verification boundary

The final report will distinguish static/typecheck/build evidence from live database and browser-preview evidence. No production deployment or merge with the other recovery worktrees is in scope.
