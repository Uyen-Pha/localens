# LocalLens — Luna Task 14 Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Các hợp đồng “đề xuất mới” dưới đây chưa tồn tại trong code; implementer phải phân biệt chúng với API đã có.

**Goal:** Người dùng tạo/tinh chỉnh và mở lại được lịch trình; lỗi/retry không gây trùng dữ liệu hoặc mô tả sai khả năng, trước khi chốt Task14 của roadmap tổng.

**Architecture:** Giữ runtime port, adapter và owner-scoped readback đã có. Thêm metadata khôi phục tối thiểu ở trình duyệt và biên operation phía server trước side effect; không chuyển dữ liệu chuẩn sang localStorage làm nguồn thẩm quyền.

**Tech Stack:** TypeScript, React, Supabase PostgreSQL/RLS/Edge, Vitest và runtime E2E hiện có. Không thêm dependency.

**Agent policy cập nhật:** controller/implementer **GPT-5.6 Luna / Max / Fast**; mọi reviewer R **GPT-6 Astra / High / Normal**. Áp dụng kiểm tra effective speed và giới hạn công cụ theo mục4 của master trước dispatch.

**Spec:** Spec public-thesis-demo ngày 2026-09-04; planner plan Tasks1–7; rulings ledger; master `2026-09-05-localens-integrated-luna-execution.md`.

## Global Constraints

- G0 của master phải đạt. Đọc source từ checkout thực tế; không dùng worktree review làm implementation root mặc định.
- Tiền trên wire giữ decimal string theo contract hiện tại; domain/persistence theo mapper đã validate. Không đổi định dạng trong task UX.
- Không tự gọi AI khi mount, reload, account switch, stale readback hoặc quota error.
- `getPlan` tiếp tục qua user client/RLS. Owner trong browser là phạm vi cache, không là chứng cứ phân quyền.
- Operation retry, request correlation và plan ID là ba khái niệm khác nhau; không dùng correlation ID mới mỗi HTTP request làm idempotency key.
- Không cam kết exactly-once cho cuộc gọi HTTP đến provider khi mạng/process chết; bắt buộc at-most-one committed mutation cho cùng operation và cơ chế recovery hữu hạn.

---

## 14.0 — Đối chiếu gaps với checkpoint đang chạy

**Owner:** C + R read-only. **Files đọc:** `components/customer/supabase-planner-flow.tsx`, `lib/application/planner/runtime-planner.ts`, `lib/infrastructure/supabase/planner-runtime-adapter.ts`, `supabase/functions/_shared/recommend-itinerary.ts`, `refine-itinerary.ts`, `supabase-itinerary-adapter.ts`; ledger và acceptance draft.

- [ ] Chờ checkpoint writer an toàn theo G0; lập bảng mỗi gap: còn tồn tại / đã sửa có evidence / cần reproduce.
- [ ] Kiểm tra reload: không dừng ở việc DB có revision; browser phải hiện đúng revision sau reload và tiếp tục refine.
- [ ] Kiểm tra response-loss: request đã commit nhưng client chưa biết; thao tác “thử lại” phải được trace qua UI → Edge → quota → persistence.
- [ ] Kiểm tra error mapping `INVALID_ITINERARY_INPUT`, `USD_DISABLED`, `NO_FEASIBLE_ITINERARY`; hiện snapshot cho thấy adapter có thể gom chúng thành lỗi dịch vụ. Test phải chứng minh trên checkpoint mới nhất.
- [ ] Kiểm tra copy runtime-aware, `amountMinor`, phạm vi parser refinement và đường sang fixed-tour.
- [ ] Nếu gap đã được sửa đúng và tests/review có thể tái dùng trên cùng inputs, ghi evidence và bỏ qua implementation tương ứng. Không viết lại chỉ để khớp tên helper trong plan.

**PASS:** danh sách gap còn lại có reproduction hoặc source trace cụ thể; không dựa vào báo cáo cũ để sửa code mới.

## 14.1 — Đóng băng hợp đồng trước chia việc

**Owner:** A đề xuất, R review, C chấp nhận và giữ lock. **Files:** `lib/application/planner/runtime-planner.ts`; tạo `docs/acceptance/planner-operation-contract.md` làm decision record; tests `tests/unit/planner/runtime-planner.test.ts`.

**Shared extraction trong checkpoint này:** C/worker contract tạo `lib/application/planner/refinement-signals.ts`, đổi Edge helper cùng tên thành re-export, sửa import maps cần thiết và chạy regression parser hiện có. Đây là chuyển helper pure giữ nguyên behavior, để storage/Edge dùng cùng signal contract tại14.3; không giao hai worker tự copy parser riêng.

**Đã có:** `getSession()`, `recommend(request, locale)`, `refine(input, locale)`, `getPlan(planId, locale)`; proposal chứa `planId`, `revision`, `source`, `degraded`, `items`, `totals`, `budgetVnd`, `snapshotIds`.

**Đề xuất mới tối thiểu:** operation UUID do browser tạo một lần cho hành động chủ động, cùng ID được giữ khi retry. Chốt đối số bắt buộc thứ ba cho recommend/refine trong decision record tại14.1; chỉ thêm type export mới lúc này. Signature port và toàn bộ callsite/test doubles được đổi cùng một changeset tại14.3 sau backend PASS; không để hai worker tự chọn signature hoặc để bước contract làm tree lỗi type trước dependency.

```ts
export interface RuntimePlannerOperation {
  readonly operationId: string; // UUID, không chứa owner hoặc input
}

// Hai signature thay thế, giữ nguyên kiểu Result/DTO đã có:
recommend(
  request: ItineraryRequest,
  locale: Locale,
  operation: RuntimePlannerOperation,
): Promise<Result<RuntimePlannerProposal, RuntimePlannerError>>;
refine(
  input: RuntimeRefinementRequest,
  locale: Locale,
  operation: RuntimePlannerOperation,
): Promise<Result<RuntimePlannerProposal, RuntimePlannerError>>;
```

Đây là thay đổi đề xuất. Nếu 14.0 tìm thấy contract mới tương đương đã triển khai thì giữ contract đó và sửa decision record, không bắt đổi tên cho giống plan.

- [ ] Chốt request wire `operationId` trong strict body của recommend/refine; không thêm identity/PII. **Hai runtime entrypoint đều authenticated-only**, bắt buộc JWT customer và operation ID. Thêm option `requireAuthenticated: true` cho refine handler/entrypoint tương tự recommend; guest-token không thể thay JWT tại runtime cloud. Handler guest dùng ngoài entrypoint chỉ giữ trong contract test cũ khi spec còn yêu cầu, không bật trên cloud.
- [ ] Chốt owner lấy từ JWT/server, digest tính server từ payload canonical đã validate (không trust client hash). Cùng key khác input hoặc loại thao tác phải bị từ chối, không replay kết quả sai.
- [ ] Chốt operation status/error ở một vocabulary: `OPERATION_IN_PROGRESS`, `OPERATION_CONFLICT`, `OPERATION_INTERRUPTED`; chỉ IN_PROGRESS được “kiểm tra lại”, không tự tạo operation mới.
- [ ] Chốt error business và pair messageKey theo 14.4. Snapshot/locale chỉ ảnh hưởng đúng phần contract: locale UI không được đổi bản chất mutation đã commit.
- [ ] Bổ sung optional `operationState: "rejected" | "in_progress" | "interrupted"` trong error wire và `RuntimePlannerError`. Chỉ emit sau khi server có quyết định operation được xác minh; network/response không đọc được không có field này. Parser chỉ nhận enum và code/state pair hợp lệ. `retryable` nói lỗi có thể thử lại, còn `operationState` quyết định giữ key cũ hay phải bắt đầu operation mới bằng thao tác chủ động.
- [ ] R kiểm tra producer/consumer/table state với 14.2 và 14.3. Không giao backend/UI song song trước khi contract PASS.

**Quyết định review về phương án tối thiểu:** dùng operation UUID làm plan ID và tái sử dụng quota receipt tận dụng được RPC hiện có, nhưng tự nó không bind input trước provider, không ngăn hai worker cùng gọi provider và không replay được mọi trường hợp sau khi plan đã có revision mới. Vì bản này yêu cầu các invariant mạnh hơn,14.2 đề xuất claim/commit phía server. Không tuyên bố phương án UUID-only đã đạt những invariant đó. Nếu chủ đồ án chọn thu hẹp requirement để giảm công, sửa spec/gate công khai trước; không tự thay bằng bản yếu hơn trong lúc implement.

**PASS:** signatures dự kiến thống nhất và decision record giải thích replay, expiry, crash, quota/provider, auth, old-client compatibility. Typecheck tree hiện hành vẫn xanh; chưa thay chữ ký đang được consumer sử dụng. Đây là gate thiết kế hợp đồng, chưa là gate thực thi API.

## 14.2 — Operation idempotency tại server

**Owner:** A backend; độc quyền Edge/SQL. **Files sửa:**

- `supabase/functions/_shared/recommend-itinerary.ts`, `refine-itinerary.ts`, `supabase-itinerary-adapter.ts`.
- `supabase/functions/_shared/gateway.ts` cho optional typed operation error metadata; không nới logging/schema hoặc CORS.
- `supabase/functions/recommend-itinerary/index.ts`, `supabase/functions/refine-itinerary/index.ts`; `tests/unit/supabase/rls-matrix.test.ts` và `tests/unit/supabase/artifacts.test.ts` khi thay grant/entrypoint, giữ assertion lịch sử migrations và thêm assertion effective privileges mới.
- Hai function `deno.json` nếu thêm shared imports; output generated types thực tế là `lib/infrastructure/supabase/database.types.ts` theo `scripts/write-generated-db-types.mjs`; sinh từ DB cô lập đúng schema, không sửa bằng tay.
- Tests: `tests/unit/supabase/recommend-itinerary-handler.test.ts`, `refine-itinerary-handler.test.ts`, `supabase-itinerary-adapter.test.ts`.
- Tạo `supabase/functions/_shared/planner-operation.ts`, `tests/unit/supabase/planner-operation.test.ts`, `supabase/tests/database/planner_operation_test.sql`.
- Tạo migration có timestamp mới bằng CLI đã ghim với tên `planner_operation_idempotency`; ghi filename thực tế vào brief trước sửa, không dùng timestamp cố định có thể đụng writer khác.

**Nền tảng đã có:** `reserve_ai_quota` có reservation ID và state `created/replayed`; `create_authenticated_trip_plan(p_plan_id, persistence_dto)` có khóa và kiểm tra fingerprint. Hiện adapter tạo UUID mới khi reserve/commit. Chỉ đổi UUID ở client hoặc chỉ sửa retry button chưa đóng được toàn bộ boundary.

Shared module mới phải có parser không side effect để handler kiểm tra trước DB/provider:

```ts
export function parsePlannerOperationId(value: unknown): string | null;
```

Regression khởi đầu hoàn chỉnh trong `tests/unit/supabase/planner-operation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parsePlannerOperationId } from "@/supabase/functions/_shared/planner-operation";

describe("planner operation id boundary", () => {
  it.each([null, undefined, 1, {}, [], "", " not-a-uuid ", "customer:alice"])(
    "rejects an untrusted operation identifier: %j",
    (value) => expect(parsePlannerOperationId(value)).toBeNull(),
  );
  it("accepts a bounded UUID without changing its identity", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    expect(parsePlannerOperationId(id)).toBe(id);
  });
});
```

Parser dùng schema UUID cùng thư viện đã có, không coi UUID hợp lệ là quyền truy cập. Test trên chỉ là RED/GREEN boundary đầu tiên; ma trận concurrency/persistence bên dưới mới chứng minh idempotency. Không được thay các case DB bằng parser tests.

### 14.2.A — Trạng thái và claim

**Hợp đồng RPC mới được chốt để triển khai, không phải API hiện có:** migration tạo bảng `private.runtime_planner_operations` và các functions dưới. Tất cả functions mới là SECURITY DEFINER, `search_path=''`, `statement_timeout='5s'`, owner `localens_plan_rpc_owner`; REVOKE EXECUTE từ PUBLIC/anon/authenticated và chỉ GRANT cho `service_role`. Edge xác thực JWT customer trước khi gọi bằng service client. `p_actor_user_id` được lấy từ principal đã xác minh, tuyệt đối không từ body; mỗi RPC kiểm role customer và operation.owner. Các lease/quota UUID không trả về browser. Browser đọc proposal qua user client/RLS; service RPC chỉ trả reference hoặc safe status.

```sql
-- claim bao gồm lookup/replay và expiry reconciliation nguyên tử.
public.claim_runtime_planner_operation(
  p_actor_user_id uuid, p_operation_id uuid, p_kind text,
  p_request_digest text, p_target_plan_id uuid, p_base_revision integer
) returns jsonb;

-- Read-only status; không tự claim mới, reserve, expire hoặc gọi provider.
public.get_runtime_planner_operation(
  p_actor_user_id uuid, p_operation_id uuid, p_request_digest text
) returns jsonb;

public.complete_runtime_recommendation(
  p_actor_user_id uuid, p_operation_id uuid, p_request_digest text,
  p_lease_token uuid, p_persistence_dto jsonb
) returns jsonb;

public.complete_runtime_refinement(
  p_actor_user_id uuid, p_operation_id uuid, p_request_digest text,
  p_lease_token uuid, p_persistence_dto jsonb
) returns jsonb;

public.reject_runtime_planner_operation(
  p_actor_user_id uuid, p_operation_id uuid, p_request_digest text,
  p_lease_token uuid, p_error_code text
) returns jsonb;
```

SQL `jsonb` phải qua strict parser ở Edge với union đề xuất dưới; không cast JSON không kiểm tra thành DTO:

```ts
type OperationDecision =
  | { state: "claimed"; leaseToken: string; leaseExpiresAt: string;
      planId: string; plannerReservationId: string; geminiReservationId: string }
  | { state: "in_progress" }
  | { state: "completed"; planId: string; revision: number }
  | { state: "rejected"; errorCode: OperationRejectedCode }
  | { state: "interrupted" }
  | { state: "conflict" }
  | { state: "missing" }; // get only; claim không trả missing
type OperationRejectedCode =
  | "QUOTA_EXCEEDED" | "CATALOG_UNAVAILABLE" | "TRAVEL_DATA_UNAVAILABLE"
  | "FX_UNAVAILABLE" | "STALE_REVISION" | "INVALID_ITINERARY_INPUT"
  | "USD_DISABLED" | "NO_FEASIBLE_ITINERARY" | "ITINERARY_SEARCH_LIMIT"
  | "INVALID_ITINERARY_RESULT" | "PLAN_NOT_FOUND" | "PLAN_UNAVAILABLE"
  | "SNAPSHOT_MISMATCH" | "LOCKED_ITEM_INVALID";
```

`complete_*` trả completed hoặc safe conflict/interrupted; nếu operation đã terminal rejected thì trả lại rejected cùng `errorCode` allowlisted; reject chỉ cho code trong enum đã migrate, không lưu raw message. Refine target/base không null; recommend target/base null khi claim mới. DB tạo plan ID cho recommend; refine giữ target đã bind. `get` trả in_progress cho claimed chưa terminal; claim xử lý expiry dưới khóa. Wrapper complete xác minh digest/kind/lease/owner, dùng bound target/base từ bảng, không nhận target/base mới từ client.

**Đường ghi operation-aware:** wrappers do `localens_plan_rpc_owner` sở hữu, trong cùng transaction đặt JWT claim cục bộ từ actor đã kiểm tra (`set_config(..., true)`), gọi `create_authenticated_trip_plan` hoặc `advance_authenticated_trip_plan_revision`, rồi ghi reference và completed trước COMMIT. Owner function có quyền gọi routines mình sở hữu; migration phải kiểm chứng quyền thực của routine advance trước tạo wrapper và grant EXECUTE tối thiểu nếu owner khác. REVOKE EXECUTE cả ba đường ghi cũ `create_authenticated_trip_plan`, `advance_authenticated_trip_plan_revision`, và `advance_trip_plan_revision` khỏi PUBLIC/anon/authenticated/service_role ở migration mới để client không ghi vòng qua operation; giữ quyền nội bộ tối thiểu cho wrapper. Mọi callsite runtime phải chuyển sang wrappers; pgTAP phải chứng minh direct authenticated calls cũ bị từ chối và wrappers không callable bằng anon/authenticated. Không sửa migration lịch sử để làm test grant cũ mất ý nghĩa.

**Digest v1:** server tạo canonical JSON của `{v:1, kind, payload}` từ request đã schema-validate. Object keys sort lexicographic recursively; arrays mang thứ tự như timeline giữ thứ tự, riêng `areas`, `lockedStopIds`, `lockedItemIds`, `dietaryRequirements`, `mobilityRequirements` xử lý theo set: deduplicate + sort. Timestamp bắt buộc offset rõ ràng, hợp lệ, tối đa millisecond và serialize UTC `YYYY-MM-DDTHH:mm:ss.SSSZ`; number finite/canonical JSON; UUID lowercase. V1 không có default ngầm/clock-derived: mọi member recommend/refine đã đóng băng phải hiện diện, mảng rỗng giữ `[]`, absent không default bị omit, explicit `null` không thuộc digest. Đổi default phải tăng version. Với refine, payload gồm target/base/scope và supported signals theo mục14.3; không chứa raw feedback, locale, correlation hay owner. SHA256 hex tính phía server; operation scope đã bind owner. Test reorder keys/set cho cùng digest, đổi budget/base/scope/lock/signal cho khác digest.

- [ ] Thêm regression RED cho hai request cùng operation đi đồng thời vào recommend. Kỳ vọng chỉ một worker được phép đi tiếp đến provider; worker còn lại nhận IN_PROGRESS hoặc replay kết quả đã commit.
- [ ] Tạo bảng private operation có unique `(owner_user_id, operation_id)`, loại thao tác, canonical digest, state, lease/version token, timestamp, kết quả tham chiếu `(plan_id, revision_no)`, quota reservation IDs ổn định. Không lưu raw prompt/PII.
- [ ] DB tạo `planner_reservation_id`, `gemini_reservation_id`, `lease_token` và recommend `plan_id` bằng `gen_random_uuid()` **một lần khi insert claim**; persisted trước reserve. Hai quota IDs khác nhau, có unique constraint riêng; replay trả chính IDs đã lưu. RPC không nhận quota/lease IDs từ browser, và reserve helper chỉ chấp nhận reservation ID của đúng kind từ decision đã parse.
- [ ] RPC claim server-only sau auth và input validation, trước planner/Gemini quota. Không giữ transaction DB mở trong lúc gọi provider. Binding owner do server xác minh; audit GRANT/REVOKE/RLS và fixed search_path theo mẫu RPC hiện có.
- [ ] Table owner là `localens_plan_rpc_owner`; không GRANT table access cho anon/authenticated/service_role. RPC owner được đọc/ghi bảng private theo policy tối thiểu, kiểm actor/operation ở mọi nhánh. pgTAP chứng minh gọi service RPC bằng role không được cấp bị từ chối; Edge negative tests chứng minh thiếu/sai JWT, guest token và non-customer không chạm claim/quota/provider.
- [ ] State machine duy nhất: `claimed` → `completed` **hoặc** `rejected` **hoặc** `interrupted`; cả3 là terminal. Lease60giây, token/version chống worker cũ commit; kiểm tra thời gian server. Chưa có completion khi lease hết: readback/reconcile dưới lock rồi interrupted nếu thật sự không commit. Rejection đã biết ghi rejected ngay, không đợi lease. Không tự cướp lease và gọi Gemini lần nữa trong cùng operation.
- [ ] Reconcile/expire và commit phải cạnh tranh dưới cùng row lock/CAS trong DB: không read ngoài transaction rồi đánh interrupted mù. Nếu commit thắng thì replay completed; nếu expire thắng thì token cũ không thể commit. Test ép đúng hai thứ tự để chứng minh không có plan mồ côi và không trả interrupted cho mutation đã commit.
- [ ] Cùng owner/key/digest hoàn thành: readback đúng `(plan_id, revision_no)` đã ghi; không reserve quota/provider mới. Cùng key khác digest/kind: CONFLICT. Owner khác không đọc/claim/replay operation của A.
- [ ] Với refine, thứ tự cố định là JWT/body validation → canonical digest → claim/lookup/replay → **chỉ operation mới** mới kiểm latest/baseRevision/snapshot/quota/provider. Không đặt stale check cũ trước replay. Completed retry sau revision mới hơn phải trả operation reference cũ; bản mới nhất được UI đọc riêng khi cần.
- [ ] State terminal thêm `rejected`: lỗi nghiệp vụ/quota/catalog sau claim gọi reject RPC ghi allowlisted code, không giữ pending đến hết lease. Retry cùng key/digest trả cùng safe error, không gọi provider/quota; nếu muốn thử lại vì điều kiện ngoài đã đổi thì người dùng chủ động tạo operation mới. Lỗi chưa xác định có thể đã commit phải reconcile theo reference trước; không đổi thành rejected mù.

### 14.2.B — Quota, commit và crash

- [ ] Giữ reservation ID ổn định riêng cho planner và Gemini ở operation; dùng replay của RPC quota. R xác minh RPC bind IP/device/kind hiện có để không biến key tái dùng thành bypass quota.
- [ ] Provider chỉ gọi sau claim và reserve hợp lệ. Operation duplicate không phát sinh provider call. Nếu worker chết sau khi gửi HTTP, ghi trạng thái không biết kết quả provider; không khẳng định provider chưa tính phí.
- [ ] Commit plan/revision và chuyển operation completed phải cùng transaction: wrapper RPC gọi persistence hiện hữu và ghi operation reference, kiểm tra lease token/kind/digest/owner. Chặn đường runtime bỏ qua operation wrapper nếu nó phá invariant; không nới quyền service role ở client.
- [ ] Refinement dùng `planId + baseRevision + delta + lockedItemIds` trong digest; stale vẫn fail đúng optimistic concurrency. Replay operation refine đã completed trả revision của chính operation, sau đó UI có thể đọc latest riêng. Không áp dụng lại delta lên revision mới.
- [ ] Response loss sau commit: retry cùng operation phải readback kết quả cũ kể cả plan đã có revision mới; không dùng RPC create cũ yêu cầu latest revision=1 làm cơ chế replay duy nhất.
- [ ] Failure domain trước commit có kết quả terminal rõ; sửa input là hành động mới với key mới. Timeout network/IN_PROGRESS giữ key cũ và nút kiểm tra trạng thái; sau interrupted terminal, người dùng chủ động tạo lại mới sinh operation mới.
- [ ] Không purge completed operation trong phiên demo vì có thể tái sử dụng key dẫn đến mutation trùng. Retention/cleanup ngoài phạm vi; data demo hữu hạn theo quota. Nếu cần cleanup thì giữ tombstone hoặc cơ chế không tái sử dụng key đã nhận.

**Mã kiểm thử hành vi:** dùng fake adapter/query builders hiện có trong test handler/adapter; bổ sung counter thực từ fake provider và DB test harness, không chỉ assert hàm RPC đã được gọi. Ma trận bắt buộc:

| Case | Kết quả DB/quota/provider |
|---|---|
| Hai request đồng thời cùng key | 1 mutation; 1 quyền gọi provider; loser IN_PROGRESS/replay |
| Retry sau DB commit, response mất | Cùng plan/revision; quota không tăng; provider không tăng |
| Cùng key khác input | CONFLICT trước provider, không thay plan |
| A/B cùng key | Phạm vi owner độc lập; không rò kết quả A |
| Refine đã thành công rồi response mất | Một revision mới; không replay delta vào latest |
| Process chết trước provider | Lease hữu hạn, interrupted; không giả proposal |
| Process chết sau provider, trước commit | Không tự gửi provider lần hai; old token không commit sau terminal |
| Commit thành công rồi plan đã refine thêm | Replay vẫn trỏ kết quả operation ban đầu đúng |
| Quota refusal và replay | Không gọi provider, không tăng reservation do retry |
| Business/catalog/quota rejection sau claim | Terminal rejected ngay với safe allowlisted code; replay cùng key trả cùng lỗi,0reserve/0provider/0mutation mới |
| Rejected rồi worker/token cũ muốn complete | DB từ chối transition ra terminal; không có plan/revision mồ côi |
| Wrapper/fingerprint/RLS bị giả | DB từ chối; không bypass validation hoặc owner |

```powershell
corepack.cmd pnpm test:run tests/unit/supabase/planner-operation.test.ts tests/unit/supabase/recommend-itinerary-handler.test.ts tests/unit/supabase/refine-itinerary-handler.test.ts tests/unit/supabase/supabase-itinerary-adapter.test.ts --no-file-parallelism --testTimeout=30000
corepack.cmd pnpm db:static
```

### 14.2.C — Gate DB trước khi UI tiêu thụ

- [ ] C chạy guard/isolation được mô tả ở14.5 **ngay tại checkpoint này**, rồi migrations + `planner_operation_test.sql` + quota/RLS/concurrency + generated types liên quan. Nếu harness chưa isolate được, sửa/kiểm tra harness tại đây trước, không trì hoãn đến sau UI.
- [ ] A nộp unit evidence; R kiểm spec/quyền/transaction; C kiểm DB evidence thật. Pure storage helper14.3 có thể đã chuẩn bị song song nhưng adapter/UI integration phải chờ gate này.

**PASS14.2:** unit/contract và DB/RLS/concurrency liên quan đều xanh. 14.5 về sau là gate tích hợp tổng, không là prerequisite vòng ngược của14.2. Nếu implementation vượt một task nhỏ, tách14.2.A/B/C thành brief tuần tự; không bỏ crash semantics để giữ tiến độ.

## 14.3 — Mở lại lịch trình và giữ operation ở browser

**Owner:** B pure helper trước, A/B tích hợp tuần tự sau 14.2. **Files:** tạo `lib/application/planner/runtime-planner-session.ts`, `tests/unit/planner/runtime-planner-session.test.ts`; sửa `components/customer/supabase-planner-flow.tsx`, `lib/infrastructure/supabase/planner-runtime-adapter.ts`, tests tương ứng và `tests/e2e/runtime-itinerary.spec.ts`.

**Input:** authenticated customer scope, owner-scoped getPlan, operation contract 14.1. **Output:** latest plan pointer và pending operation pointer, không cache proposal làm dữ liệu chuẩn.

Helper đề xuất mới, dependency-free và injected Storage/clock:

```ts
export interface RuntimePlanPointer {
  readonly version: 1;
  readonly ownerUserId: string;
  readonly planId: string;
  readonly savedAt: number;
}
export const RUNTIME_PLAN_POINTER_KEY = "localens.runtime.plan-pointer.v1";
export function saveRuntimePlanPointer(
  storage: Pick<Storage, "setItem" | "removeItem">,
  pointer: RuntimePlanPointer,
): boolean;
export function readRuntimePlanPointer(
  storage: Pick<Storage, "getItem" | "removeItem">,
  ownerUserId: string,
  now: number,
): RuntimePlanPointer | null;
```

Pointer chỉ lưu 4 trường trên; TTL 24 giờ. Pending operation lưu key/owner/kind và payload có cấu trúc đã lọc PII cần để retry trong **sessionStorage**, TTL theo phiên/handoff hiện tại. Không lưu raw specialNeeds. Logout xóa pointer/pending của ứng dụng; không dùng `storage.clear()`.

**Pending schema bắt buộc:** extract helper pure `normalizeRefinementSignals` và type `RefinementSignals` từ `supabase/functions/_shared/refinement-signals.ts` sang file mới `lib/application/planner/refinement-signals.ts`; Edge file re-export để giữ callsites, cập nhật hai Deno import maps. C giữ file lock tại contract checkpoint, B chỉ dùng export đã ổn định. Chạy test `tests/unit/supabase/refinement-signals.test.ts` và import-boundary tests trước khi coi extraction đạt. Không import Edge module có server dependencies vào UI.

```ts
type RuntimePendingOperation =
  | { version: 1; ownerUserId: string; operationId: string; savedAt: number;
      kind: "recommend"; request: ItineraryRequest }
  | { version: 1; ownerUserId: string; operationId: string; savedAt: number;
      kind: "refine"; planId: string; baseRevision: number;
      scope: "partial" | "full"; lockedItemIds: readonly string[];
      signals: { pace: "keep" | "slower" | "faster";
        food: "keep" | "more" | "remove";
        preferTypes: readonly ("history" | "traditional_craft" | "traditional_market")[];
        avoidTypes: readonly [] } };
```

Recommend request chỉ chứa fields allowlist của ItineraryRequest sau mapper; strict schema loại extra keys, array free strings chỉ nhận IDs đã có trong allowlist preference của form. Không lưu note raw dưới tên dietary/mobility. Với refine, feedback nguyên văn chỉ tồn tại trong React state, normalize trước persist/invoke. Wire hiện giữ `delta.feedback` nhưng tạo lại từ fixed phrases: pace→`slower`/`faster`, food→`more food`/`remove food`, prefer→`history`/`craft`/`market`, nối bằng `; `; “keep” không thêm phrase. Chuỗi canon này dùng ngay lần gửi đầu và mọi retry; không gửi lại raw text. Tất cả signals keep/empty thì báo input chưa được hỗ trợ, không claim/provider. Test raw email/special note không có trong sessionStorage, retry body, digest/log/provider; unsupported request không được báo áp dụng thành công.

- [ ] Pure helper RED: invalid JSON/extra fields/invalid UUID/expired/future timestamp/wrong owner/storage throws đều trả null hoặc false an toàn, không chặn render. Không xóa key không thuộc LocalLens.
- [ ] Sau PASS14.2, áp dụng chữ ký port đã chốt14.1 vào adapter, UI và toàn bộ test doubles/callsites trong một changeset14.3. Tìm đủ callsites bằng `rg`, typecheck toàn tree; không deploy frontend/backend nửa hợp đồng.
- [ ] Persist plan pointer vào localStorage sau success; nếu storage bị chặn vẫn hiển thị proposal hiện tại và thông báo khả năng mở lại không khả dụng, không report request thất bại rồi khuyến khích generate lần nữa.
- [ ] Khi mount: resolve session → pointer đúng owner → `getPlan`; latest revision từ DB là nguồn thẩm quyền. Chỉ khi không có pointer hợp lệ mới trở về bước generate với handoff hợp lệ.
- [ ] Logout/account change hủy hiệu lực request đang chờ; response của owner A đến muộn không được render sau khi đã đổi sang B. Xóa đúng keys và cache UI.
- [ ] Pending operation được lưu trước lần invoke đầu; nếu lưu thất bại không tạo cảm giác đã đảm bảo retry qua reload. Trong phiên giữ memory key để double-click/retry không tạo key mới. Reload mất pending state cần đọc plan pointer hoặc báo trạng thái cần kiểm tra, không tự generate.
- [ ] Với IN_PROGRESS: disable mutation, cho “Kiểm tra lại” dùng cùng key; không auto loop. STALE_REVISION: getPlan latest trước khi cho refine tiếp; không auto áp lại feedback cũ.
- [ ] GetPlan forbidden/not-found: thông báo “Không thể mở lịch trình này”, xóa pointer không hợp lệ; không tiết lộ owner. Network failure: giữ pointer, CTA thử tải lại, không chuyển sang create mới.

Regression có thể thêm trực tiếp vào file component test hiện hữu vì các helper dưới đã được xác minh tồn tại:

```tsx
it("restores a persisted plan after remount without generating again", async () => {
  saveValidHandoff();
  const firstPort = plannerPort();
  const view = renderPlanner(firstPort);
  await generate();
  view.unmount();

  const secondPort = plannerPort({
    getPlan: vi.fn(async () => ({
      ok: true as const,
      value: proposal({ revision: 2 }),
    })),
  });
  renderPlanner(secondPort);
  await screen.findByRole("heading", { name: "Revision 2" });
  expect(secondPort.getPlan).toHaveBeenCalledWith(proposal().planId, "en");
  expect(secondPort.recommend).not.toHaveBeenCalled();
  expect(secondPort.refine).not.toHaveBeenCalled();
});
```

Test setup phải clear đúng pointer key trước/sau mỗi case để không phụ thuộc thứ tự. Test này là baseline, bổ sung account switch/delayed response/storage failure; nó không tự chứng minh backend persistence. E2E phải reload browser thật và thấy revision2 rồi refine tiếp; chỉ query DB sau reload là chưa đủ.

```powershell
corepack.cmd pnpm test:run tests/unit/planner/runtime-planner-session.test.ts tests/components/customer/supabase-planner-flow.test.tsx tests/unit/infrastructure/planner-runtime-adapter.test.ts --no-file-parallelism --testTimeout=30000
corepack.cmd pnpm typecheck
```

**PASS:** helper/component/adapter xanh; runtime E2E xác minh lại ở14.5; không rò dữ liệu qua owner/specialNeeds/late response.

## 14.4 — Lỗi đúng nguyên nhân, copy và bước tiếp theo

**Owner:** B duy nhất giữ dictionary/UI locks. **Files:** `lib/application/planner/runtime-planner.ts`, `lib/infrastructure/supabase/planner-runtime-adapter.ts`, `lib/i18n/dictionaries.ts`, `components/customer/supabase-planner-flow.tsx`, `components/customer/customer-home.tsx` nếu đúng owner hiện hành; các tests planner/adapter/component đang có. Đường homepage phải xác minh bằng `rg --files components` nếu owner đã đổi.

- [ ] Thêm RED table-driven tests cho các code/status/messageKey allowlisted. `itinerary.input.invalid` có nhiều dấu chấm; không dùng regex một dấu chấm rồi rơi về generic service error.
- [ ] Không render raw message server. Map code đã nhận diện sang copy trusted, kiểm tra metadata schema/bounded correlation ID. Unknown code, messageKey sai pair hoặc body malformed → generic sanitized failure.

| Edge code | HTTP | Message key hợp lệ | UI / retry |
|---|---|---|---|
| INVALID_ITINERARY_INPUT | 400 | itinerary.input.invalid | Chỉnh lựa chọn, không retry mutation nguyên input |
| USD_DISABLED | 422 | itinerary.usd_disabled | Chọn VND, không hứa hỗ trợ FX chưa bật |
| NO_FEASIBLE_ITINERARY | 422 | itinerary.no_feasible | Nới thời gian/ngân sách/khu vực, giữ input để sửa |
| CATALOG_UNAVAILABLE | 503 | recommendation.catalog_unavailable | Dữ liệu địa điểm tạm chưa sẵn sàng; trusted UI key planner.catalog_unavailable; retryable:true |
| TRAVEL_DATA_UNAVAILABLE | 503 | recommendation.travel_data_unavailable | Dữ liệu di chuyển tạm chưa sẵn sàng; planner.travel_data_unavailable; retryable:true |
| FX_UNAVAILABLE | 503 | recommendation.fx_unavailable | Chưa có tỷ giá hợp lệ; planner.fx_unavailable; chuyển VND hoặc thử yêu cầu mới; retryable:true |
| ITINERARY_SEARCH_LIMIT | 503 | itinerary.search_limit | Chưa tìm được phương án trong giới hạn; planner.search_limit; sửa/nới input hoặc thử yêu cầu mới; retryable:true |
| INVALID_ITINERARY_RESULT | 500 | itinerary.result.invalid | Kết quả không vượt kiểm tra, không hiển thị proposal lỗi; planner.result_invalid; retryable:false |
| PLAN_NOT_FOUND | 404 | refinement.plan_not_found | Không thể mở lịch trình; planner.plan_unavailable; retryable:false, không tiết lộ owner |
| PLAN_UNAVAILABLE | 503 | refinement.plan_unavailable | Lịch trình tạm chưa tải được; planner.plan_temporarily_unavailable; retryable:true, giữ pointer |
| SNAPSHOT_MISMATCH | 409 | refinement.snapshot_mismatch | Dữ liệu nền đã thay đổi; planner.snapshot_mismatch; tải lại/xem phương án mới, không replay delta; retryable:false |
| LOCKED_ITEM_INVALID | 422 | refinement.locked_item_invalid | Điểm khóa không còn hợp lệ; planner.locked_item_invalid; tải bản mới rồi sửa khóa; retryable:false |
| QUOTA_EXCEEDED | 429 | recommendation.quota_exceeded hoặc refinement.quota_exceeded theo kind | Nói rõ giới hạn; retryable:true nhưng không tự retry, không bịa proposal fallback |
| STALE_REVISION | 409 | refinement.stale_revision | Tải bản mới trước, không replay delta; retryable:true chỉ sau readback và thao tác mới |
| OPERATION_IN_PROGRESS | 409 đề xuất | planner.operation_in_progress | Kiểm tra lại cùng key, không tạo thêm mutation |
| OPERATION_CONFLICT | 409 đề xuất | planner.operation_conflict | Dừng retry, cho tạo yêu cầu mới rõ ràng |
| OPERATION_INTERRUPTED | 409 đề xuất | planner.operation_interrupted | Báo lần xử lý chưa hoàn tất; chỉ tạo lại bằng thao tác chủ động |

- [ ] Giữ AUTH_REQUIRED/AUTH_EXPIRED và SERVICE_UNAVAILABLE hiện có. `getPlan` cần phân biệt missing/forbidden với transient bằng mapping typed an toàn; không suy missing từ mọi lỗi network.
- [ ] Mở rộng `RuntimePlannerErrorCode` đúng toàn bộ code mới trong bảng. GetPlan trả0row hoặc403/404 đã xác định → `PLAN_NOT_FOUND`, `retryable:false`, trusted key `planner.plan_unavailable`; không phân biệt “của owner khác” với “không tồn tại” trên UI. 401→AUTH_EXPIRED; network/timeout/5xx→SERVICE_UNAVAILABLE retryable và giữ pointer. `PLAN_UNAVAILABLE` từ refine HTTP503 là lỗi tạm, không xóa pointer. Thêm table-driven tests cho0row,denied,401,5xx,fetch throw.
- [ ] Table-driven tests phủ **mọi** `OperationRejectedCode`: đúng HTTP/messageKey/state/retryable, copy trusted VI/EN và CTA. Rejected+retryable chỉ cho hành động “Thử yêu cầu mới” tạo key mới sau click; retry key cũ chỉ replay error. IN_PROGRESS/unknown network giữ key cũ. Rejected+nonretryable yêu cầu sửa input/readback trước; không generic hóa mã hợp lệ và không dùng raw message server. Server sau reject xác nhận phải gửi `operationState:"rejected"` để UI không nhầm lỗi cuối với response-loss chưa rõ kết quả.
- [ ] Thay copy kỹ thuật như `amountMinor` bằng đơn vị VND/USD phù hợp contract. Home supabase nói AI thật/advisory; demo mode nói mô phỏng đúng thực tế. Không đổi cả layout chỉ vì sửa copy.
- [ ] Thêm hướng dẫn ngắn/preset dùng các control hiện có: ưu tiên lịch sử, ẩm thực, nhịp độ thư giãn. Chọn preset không tự gọi AI. Ngày mặc định phải được tính/validate theo múi giờ hiện hành, không hard-code ngày đã qua.
- [ ] Với feedback không chuyển được thành supported signals, báo hướng dẫn các lựa chọn được hỗ trợ; không hiển thị “đã chỉnh theo yêu cầu” nếu parser không áp dụng. Dùng parser hiện có; nếu cần sửa hành vi parser thì tạo regression trong `tests/unit/supabase/refinement-signals.test.ts` và brief riêng, không gửi raw feedback sang Gemini.
- [ ] Sau proposal thêm đường dẫn đúng danh mục tour cố định trong locale hiện tại, copy “Khám phá tour cố định”; không “Đặt lịch trình này”. URL lấy từ route hiện hữu đã kiểm tra, không tự đặt route mới.
- [ ] R review VI/EN, screen reader/error states và screenshot. Giữ payment disclosure hiện có ở checkout/receipt.

```powershell
corepack.cmd pnpm test:run tests/unit/planner/runtime-planner.test.ts tests/unit/infrastructure/planner-runtime-adapter.test.ts tests/components/customer/supabase-planner-flow.test.tsx tests/components/customer/personalization-form.test.tsx tests/components/customer/planner-surface.test.tsx tests/unit/supabase/refinement-signals.test.ts --no-file-parallelism --testTimeout=30000
```

**PASS:** business error không bị generic hóa, retry CTA đúng state, copy không quá khả năng, UI cùng design system. Preset là trợ giúp input, không là một luồng giả khác backend.

## 14.5 — Gate tích hợp trên runtime cô lập

**Owner:** chỉ C vận hành; R đọc evidence. **Files:** test/harness hiện có khi cần sửa guard; evidence dưới `docs/acceptance/` và design QA. Không chỉnh assertion để hợp với bug.

- [ ] Inventory project IDs/ports/containers/DB endpoints và PID owned. `54321/54322` có thể thuộc DB thuyết trình `localens-mvp`; không coi loopback đồng nghĩa disposable.
- [ ] Read harness mới nhất. `db:verify` hiện có bước `db:reset` và DB port mặc định; **không chạy trực tiếp khi chưa chứng minh toàn bộ target thuộc task**. Dùng isolated runtime harness đã có để dựng project+ports riêng, chạy migration/SQL/RLS/concurrency/types trên chính project đó. Nếu chưa có cách chạy đầy đủ DB gate cô lập, bổ sung guard/harness có test như một phần14.5, không tạm trỏ vào DB thuyết trình.
- [ ] Ghi readiness dựa health endpoint/log cụ thể; timeout hữu hạn theo số đo cold start, không sleep hoặc retry vô hạn. Guard phải từ chối port/project đang thuộc presentation.
- [ ] Chạy static/unit tuần tự trong một shell có stop-on-failure. Sau mỗi command C đọc exit code; PowerShell không tự dừng mọi native command chỉ vì trước đó lỗi.

```powershell
corepack.cmd pnpm lint
if ($LASTEXITCODE -ne 0) { throw 'lint failed' }
corepack.cmd pnpm typecheck
if ($LASTEXITCODE -ne 0) { throw 'typecheck failed' }
corepack.cmd pnpm test:run --no-file-parallelism --testTimeout=30000
if ($LASTEXITCODE -ne 0) { throw 'unit gate failed' }
corepack.cmd pnpm db:static
if ($LASTEXITCODE -ne 0) { throw 'db static failed' }
corepack.cmd pnpm build:demo
if ($LASTEXITCODE -ne 0) { throw 'demo build failed' }
```

- [ ] Build Supabase bằng env hợp lệ cho build job riêng; `sb_publishable_ci_build_only` chỉ chứng minh build, không là key runtime. Không thay env của phiên khác. Chạy `corepack.cmd pnpm build:supabase` sau build demo đã xong.
- [ ] Chạy DB migrations/pgTAP/RLS/concurrency/generated types trên project isolated; verify operation mới cùng quota/payment/cancel không regression. Record actual test counts, không hard-code lịch sử1669/1591 thành expected hiện tại.
- [ ] Đặt `LOCALENS_RUNTIME_BROWSER=chrome` trong job riêng đã chọn; chạy tuần tự `test:e2e`, `test:e2e:runtime-itinerary`, `test:e2e:runtime-auth`, `test:e2e:runtime-fixed-tour`, `test:e2e:runtime-guide-assignment` **chỉ sau guard từng runner chứng minh target cô lập**. Nếu runner khác chưa isolate, sửa guard hoặc chạy trong môi trường disposable đã xác minh trước; không mượn port chung.
- [ ] Runtime itinerary E2E gồm owner/reload/retry/network-loss/refine/stale/quota/fallback. Fake Gemini của local harness chỉ chứng minh integration contract, không phải provider thật.
- [ ] Lưu artifact đã redact; cleanup chỉ resources task tạo; đối chiếu DB presentation bằng probe read-only không chứa PII nếu cần. Không kill PID/container không rõ owner.

**PASS:** mọi gate liên quan trên tree/candidate xác định exit0, đầy đủ browser và DB evidence, không suy build xanh là cloud ready.

## 14.6 — Review cuối và nhập kết quả vào task tổng

**Owner:** reviewer mới R → C. **Files:** ledger task tổng; `docs/acceptance/planner-experience.md`; `docs/design/qa/public-thesis-demo/README.md`.

- [ ] R đọc diff thật từ baseline đến candidate, requirements1–14 và evidence, kiểm tra gap đã sửa không làm mất behavior đã đạt.
- [ ] C mở screenshot và kiểm tra 3viewport/2locale/trạng thái chính; README phải phản ánh artifact thật, không giữ “0 screenshot” nếu đã có hoặc bịa screenshot chưa chụp.
- [ ] Acceptance draft phải bỏ các giá trị pending bằng kết quả thật; không ghi fallback cho quota nếu không có proposal. Ghi giới hạn local fake provider, preview/cloud chưa nghiệm thu.
- [ ] Chốt product SHA; nếu code/config đổi sau gate thì invalidate đúng evidence và chạy lại phần chịu ảnh hưởng. Tách evidence commit khỏi product SHA minh bạch.
- [ ] Chỉ khi reviewer không còn Critical/Important và C verify đạt: task tổng ghi **14/22 = 64% số task** theo quy ước hiện hữu. Nếu task tổng yêu cầu push/CI trước complete thì giữ yêu cầu đó, không đánh completed sớm.

**G14 PASS → Task15 được mở.** Nếu có gate chưa chạy hoặc bị chặn: ghi BLOCKED với nguyên nhân và phần độc lập còn chuẩn bị được; không sửa tỷ lệ để làm người dùng nghĩ bản deploy đã sẵn sàng.
