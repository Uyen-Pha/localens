# Research-v2 planner integration

Approved scope: integrate the internal simulation data, not commercial availability. Exclude LL-R27–LL-R30. No fabricated AI data.

1. Add a typed server evaluator and tests for every form area, budget, duration, capacity, opening windows, return travel and hostile AI output. Run tests red, implement, run green.
2. Add an authenticated Supabase research-planner function. Send only filtered IDs and trusted attributes/weights to Gemini; require a permutation of candidate IDs. Revalidate and build all output from the server dataset. Return explicit failures; no AI fallback disguised as AI.
3. Add the research area options and client port. On submitted form, start one request, show processing, render timeline/transfers/cost summary and actionable errors. Preserve form state for editing.
4. Run typecheck, focused tests and build. Check backend deployment access, publish only after verification; report missing provider/config/deployment separately.

The existing saved legacy planner remains separate. New sample results do not create bookings. All sample prices/travel/group limits retain simulation disclosure. Origin is the documented central meeting-point assumption, shown in results.
