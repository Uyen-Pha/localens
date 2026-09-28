# Home and six-tour recovery — 2026-09-28

## Approved boundary

Keep the green homepage and map. Show the six historical tours and their information, but expose booking only for a real future scheduled departure with remaining capacity. Preview only. No main merge, production promotion, database/schema/seed mutation, or changes to booking/payment/guide runtime.

## Source and changes

- Homepage component and green stylesheet retained; no replacement from an old runtime.
- Existing catalog recovery merges three Supabase tours with three source-backed proposals from `data/demo/fixed-tour-additions.v1.json`, deduplicating locale/slug. This is display recovery, not creation of six bookable database records.
- `components/customer/runtime-tour-catalog.tsx`: independently expandable information for every card (meeting point, ordered itinerary, inclusions, exclusions, cancellation terms); explicit no-departure/unavailable states; booking links select the earliest matching future scheduled departure with capacity and retain its actual ID. Existing review display fallback retained.
- `tests/components/customer/recovered-tour-cards.test.tsx`: six unique cards, readable expanded details, no-departure state, invalid/cancelled/full/past departure exclusion, actual-ID linking and mixed-list earliest matching selection.
- `tests/components/tour-search.test.tsx`: completed the previously partial type-cast fixture with required tour detail fields; search behavior assertions unchanged. The first full run exposed the missing arrays once details were rendered.
- `docs/recovery/2026-09-28-preview-origin-update.md` records the separately approved previous origin addition; this recovery does not change Supabase configuration.

## Verification so far

- Focused catalog/search/merge tests: 10 passed, zero failed.
- Final typecheck, lint and local webpack demo build passed; deployed build must still be checked.
- First full run: 2,189 passed / 78 failed. The one new search-fixture failure was reproduced independently and corrected. Final full run: 2,191 passed / 77 failed / 2,268 total (`output/recovery-audit-20260928/tours-final-suite.json`). All remaining failure names match the prior Preview report; this does not establish that all underlying causes are harmless. No new failing test names.
- Independent read-only review found no critical/important issue. Its three minor findings were addressed: expanded-content/uniqueness coverage, mixed departure selection coverage, and clearer unavailable wording.
- Prior Preview read-only catalog shows six cards: Dấu ấn Sài Gòn; Sắc màu Chợ Lớn và trải nghiệm làm đèn Phú Bình; Mỹ thuật Sài Gòn và du ngoạn sông chiều tối; Dạo Chợ Lớn: Chợ Bình Tây và bữa cơm địa phương; Sài Gòn đời thường: Cà phê vợt và Tân Định; Củ Chi: Theo dấu lịch sử tại Bến Đình. New deployment visual verification is still pending.

## Not claimed

No production acceptance, full-suite pass, actual reservation/payment, or all-role end-to-end acceptance. The reported disabled Planner adjustment controls remain a separate unresolved task. A new unique Preview origin is not automatically covered by the previously approved Supabase origin; do not silently expand configuration.
