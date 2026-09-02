# LocalLens Green Production-Aligned Demo Scope and Design Lock

**Date:** 2026-08-31
**Status:** Task 1 scope and visual-source lock
**Plan:** `docs/superpowers/plans/2026-08-31-localens-green-production-aligned-demo.md`
**Base:** `5335bfd131cc8b8cf673879366ca83fc5dc6d722`

## Decision summary

This task locks the thesis/engineering scope delta and the selected
green-white customer visual source for the production-aligned demo. It is a
documentation and reference-asset change only; it does not implement
production code, runtime services, authentication authority, RLS, payment
processing, or deployment.

The old editorial reference is superseded for customer UI by the selected
green-white source. The old reference file, its specification, QA artifacts,
and history remain in place until the new design passes visual QA; this task
does not delete, overwrite, or archive them.

## Agent orchestration lock

The linked implementation plan is the canonical execution policy. All
project-agent turns use Fast mode (`service_tier = "priority"`). The root
controller, PM/Architecture Lead, coordinator, and every independent spec,
code, security, data/RLS, design-fidelity, UX, accessibility, or final
approval reviewer use `gpt-5.6-sol` at reasoning `high`. All research,
implementation, visual/asset build, test-authoring, evidence, fix, and
integration workers use `gpt-5.6-luna` at reasoning `max`.

Role classification follows the assigned action rather than the agent title.
In particular, a Product Design builder is a Luna Max worker, while Product
Design source-comparison, UX, design, and accessibility approval are separate
Sol High reviewer tasks. Every dispatch sets model and reasoning effort
explicitly, and no maker may approve its own work.

## Selected visual source

| Field | Locked value |
| --- | --- |
| External source | `C:\Users\Admin\.codex\generated_images\01a024a9-db76-7981-82da-d2abc4e6f409\exec-3195d074-6011-4975-81e8-c2d4f9cf4b17.png` |
| Repository reference | `docs/design/references/localens-green-home-selected.png` |
| SHA-256 | `4CE3DA5E08635D2B7F2F2BF3417B34878A029B0D8547964D5E7518082D75447D` |
| Decoded dimensions | `1487 x 1058` |
| Use | Green-white art-direction reference for the customer UI |

The repository reference must be a byte-for-byte copy of the external source.
It is a visual reference only: implementation must recreate the design with
real UI, layout, typography, and maintained assets rather than using the
reference as a background, crop, or production screenshot.

The former editorial reference remains at
`docs/design/references/localens-editorial-home-selected.png`, with its
editorial specification and QA history. It is historical context only for
customer UI after this lock and is not the current selected source. The old
files remain until the green design has passed QA.

## Thesis and engineering scope delta

The following table is the authoritative clarification for the thesis demo
and its production-aligned engineering boundary. It does not broaden the
product into unapproved runtime or payment capabilities.

| Concern | Thesis/demo scope | Engineering boundary |
| --- | --- | --- |
| Tour review | Included. A customer can submit a tour review for a completed booking, with at most one review per completed booking. | Keep ownership and completion checks explicit; persistence and production authorization remain replaceable seams until their migration/RPC/RLS work is complete. |
| Cancellation | Included. A customer submits a cancellation request and an administrator makes the decision. | Keep the request and administrator decision separate from guide capabilities; do not let a guide decide a cancellation. |
| Guide UI | The guide UI does not expose accept or complete actions. | Guide UI is limited to allowlisted profile fields and the guide's own assigned-tour details/schedule. Any retained assignment state machine is not a guide-facing accept/complete control. |
| Anonymous access and authentication | Anonymous browsing is allowed. Authentication is required before submitting a request or booking. | Client guards are UX only; the production authority remains the backend/RLS boundary. |
| Payment | Payment is simulated in the thesis demo. The demo does not collect card numbers, CVV, real tokens, or real charges. | Keep a replaceable payment boundary and disclose simulation in the UI, flow, tests, and business documentation. A test/mock checkout is not evidence of a real payment integration. |

The existing fixed-tour, personalized-tour, catalog, itinerary, quote, and
booking rules remain in force except where this table explicitly clarifies
the thesis/demo scope. LocalLens remains broader than food-only experiences;
approved cultural, historical, craft, market, local-life, and cuisine data
stay within the existing catalog boundary.

## Evidence labels

Use these labels on a specific route, use case, contract, or release record.
They are evidence levels, not interchangeable product-completion claims.

- `demo-wired`: the flow is connected to the local demo UI/adapter or fixture
  and can be demonstrated. It does not prove production persistence,
  authorization, or runtime-service health.
- `contract-implemented`: the typed boundary and its validation/tests are
  implemented. It does not prove that a live database, RLS policy, provider,
  or deployment has been exercised.
- `runtime-verified`: the behavior was exercised against the configured local
  runtime with recorded command/test evidence. Static checks, mocks, fixtures,
  and an open URL alone do not earn this label.
- `production-deployed`: the reviewed build was released to the intended
  production environment with deployment evidence and a corresponding
  production verification record. A local demo, static build, or test-mode
  payment cannot use this label.

Never promote a lower label to a higher one by inference. A task may carry
more than one label only when each label has its own evidence.

## Task 1 boundary and handoff

Task 1 is complete when the selected PNG is copied and verified, this scope
lock and the MVP addendum are committed, the README names the selected source
and labels, and the focused diff contains no production-code or unrelated
file changes. The ignored implementer report records the exact commands,
results, commit SHA, and remaining risks. The next task may define portal
contracts only after the Task 1 review gate approves this lock.
