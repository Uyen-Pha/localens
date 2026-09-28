# Các kiểm thử toàn dự án chưa đạt — Planner A

Lần chạy toàn bộ trước chỉnh thứ tự Tab cuối cùng: **2157 đạt / 81 lỗi / 2238 tổng**. Các kiểm thử tập trung được chạy lại sau chỉnh thứ tự Tab. Không coi mốc này đủ điều kiện phát hành.

Chỉ nhóm 19 lỗi `personalization-form.test.tsx` được tái hiện riêng trên nhánh nền sạch b902531. Những lỗi khác chưa được phân loại nguyên nhân/baseline ở mốc này. Không tự sửa database, bỏ test hoặc đổi nghiệp vụ để làm xanh kết quả.

Báo cáo máy đọc: `C:/Users/Admin/Documents/Project/output/recovery-audit-20260928/planner-A-suite.json`.

### components/customer/customer-home.test.tsx

- CustomerHome renders the green hero with personalization as the primary route
- CustomerHome labels route-card numbers as an illustrative demo and makes no unsupported trust claim
- CustomerHome describes a synthetic demo proposal without claiming a live AI provider

### components/customer/fixed-tour-route-surface.test.tsx

- fixed-tour route surface reads the static booking route query at the client boundary

### components/customer/personalization-form.test.tsx

- PersonalizationForm exposes every planning preference in a labeled, grouped form
- PersonalizationForm requires a date, time, and at least one area before showing the local preview
- PersonalizationForm explains when the selected Ho Chi Minh City start is not in the future
- PersonalizationForm rejects split duration totals outside the one-to-twelve-hour range
- PersonalizationForm renders a deterministic itinerary proposal after a valid preview submit
- PersonalizationForm applies visible presets to existing controls without submitting the planner
- PersonalizationForm stores a tab-local en handoff without invoking demo or runtime planning
- PersonalizationForm stores a tab-local vi handoff without invoking demo or runtime planning
- PersonalizationForm waits for hydration and composition initialization while guarding duplicate submits
- PersonalizationForm fails closed on rejected composition and retries without falling back to demo
- PersonalizationForm retries the cached demo composition through its initialization boundary
- PersonalizationForm fails closed on malformed composition
- PersonalizationForm fails closed on rejected initialization
- PersonalizationForm fails closed in Supabase mode when the tab-local handoff cannot be saved
- PersonalizationForm reveals a separate simulated planner CTA only after the local preview exists
- PersonalizationForm stores the submitted preferences for the separate planner demo after preview
- PersonalizationForm does not show a planner CTA when the tab handoff cannot be saved
- PersonalizationForm blocks a preview when party size, budget, or every priority weight is invalid
- PersonalizationForm uses whole VND minor units and cents for USD

### components/customer/planner-flow.test.tsx

- PlannerFlow locks and unlocks a stop with an accessible pressed state

### components/customer/runtime-fixed-tour-account.test.tsx

- runtime fixed-tour account announces the authoritative Vietnamese paid result after reloading

### components/customer/runtime-fixed-tour.test.tsx

- runtime fixed-tour catalog renders localized en data and live availability
- runtime fixed-tour catalog renders localized vi data and live availability
- runtime fixed-tour catalog disables sold-out departures and redacts service errors
- runtime fixed-tour booking validates party size and sends only the four browser-owned fields
- runtime fixed-tour booking reuses one session idempotency key for the same normalized payload
- runtime fixed-tour booking suppresses a duplicate submit while the first hold is pending
- runtime fixed-tour booking maps IDEMPOTENCY_CONFLICT without leaking adapter details
- runtime fixed-tour booking maps SOLD_OUT without leaking adapter details
- runtime fixed-tour booking maps NOT_FOUND without leaking adapter details
- runtime fixed-tour booking maps SERVICE_UNAVAILABLE without leaking adapter details

### components/customer/supabase-planner-flow.test.tsx

- SupabasePlannerFlow describes the ready planner without the obsolete cannot-generate claim
- SupabasePlannerFlow gives quota guidance without automatically retrying

### components/customer/tours-page.test.tsx

- localized fixed tours page renders the localized internal demo catalog and its exact tour facts
- localized fixed tours page keeps every filter and card label localized in English and Vietnamese

### components/portals/portal-surface.test.tsx

- PortalSurface shows a safe sign-in prompt for direct unauthenticated entry
- PortalSurface soft-navigates after the actual identity link click and keeps the same composition
- PortalSurface 'returns a customer to the exact valid…'
- PortalSurface 'falls back for an invalid customer re…'
- PortalSurface 'falls back for an oversized customer …'
- PortalSurface 'ignores a booking return-to for a gui…'
- PortalSurface 'ignores a booking return-to for an ad…'
- PortalSurface resets only LocalLens browser keys, signs out, and returns focus to sign-in
- PortalSurface reports an incomplete reset instead of announcing success when browser storage is blocked
- PortalSurface renders Vietnamese portal copy and demo disclosure
- PortalSurface shows the admin overview, fixed-only assignment, and simulated reporting
- PortalSurface shows cancellation history read-only while preserving personalized-request decisions
- PortalSurface announces a portal load error and recovers through the retry action

### components/portals/supabase-portal-surface.test.tsx

- Supabase PortalSurface (en) returns to runtime sign-in after sign-out
- Supabase PortalSurface (en) mounts a read-only assignment list only for the authenticated guide
- Supabase PortalSurface (vi) returns to runtime sign-in after sign-out
- Supabase PortalSurface (vi) mounts a read-only assignment list only for the authenticated guide

### components/layout/site-header.test.tsx

- SiteHeader renders an accessible primary navigation with a path-preserving language link
- SiteHeader exposes the production-aligned destinations as real links
- SiteHeader renders the Vietnamese navigation with equivalent destinations
- SiteHeader keeps the localized document shell and stable editorial font variables

### unit/data/reviewed-departures.test.ts

- runs each tour seven days every week, preserves duration and uses unique departure IDs

### unit/api/read-only-api.test.ts

- read-only API application boundary localizes Vietnamese fixed-tour detail facts while preserving source URLs and license IDs

### unit/fixed-tour/import-boundary.test.ts

- fixed-tour runtime import boundary keeps customer routes behind a bidirectional mode-selected boundary

### unit/portal/composition.test.ts

- portal composition resets the demo fixture through the composition and signs out

### unit/infrastructure/personalization-area-adapter.test.ts

- Supabase personalization area adapter reads the one current published snapshot and returns a minimal localized option

### unit/planner/demo-planner.test.ts

- demo planner adapter starts with a typed proposal containing activities, totals, and warnings
- demo planner adapter localizes fixture titles, activities, and warnings for Vietnamese visitors

### unit/planner/personalization-areas.test.ts

- personalization catalog area contract maps only the current snapshot and pins the synthetic area label

### unit/supabase/artifacts.test.ts

- static Supabase artifact gate restores postgres locally without resetting the hosted CLI session role
- static Supabase artifact gate keeps LocalLens policies and definers independent from the restricted auth schema
- static Supabase artifact gate enforces the identity SQL security contract instead of accepting marker-only migrations

### unit/supabase/rls-matrix.test.ts

- Task 13 RLS/RPC access matrix passes the final SQL/object/policy/signature/grant drift gate
- Task 13 RLS/RPC access matrix accepts CRLF generated Markdown without masking content drift
- Task 13 RLS/RPC access matrix enumerates the live final object surface and exact RPC signatures

### unit/supabase/thesis-demo-cloud-seed.test.ts

- complete inventory and stable graph comparison covers every public/private migration table plus auth.users exactly once
- complete inventory and stable graph comparison builds one explicit count/classification arm for every relation without substring ownership inference
- thesis demo database transactions upgrades only an exact v1 graph by inserting registry metadata and advancing the marker atomically

### unit/portal/routes/pages.test.ts

- portal route contracts defines every bilingual static portal route

### unit/styles/editorial-foundations.test.ts

- editorial style foundations partitions customer editorial styles through the route-owned imports
- editorial style foundations guards each owned stylesheet with a complete-content SHA-256 checksum
- editorial style foundations reflows the route stops on mobile without hiding copy or masking page overflow

