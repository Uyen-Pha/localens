# LocalLens — Luna Cloud Release Implementation Plan (Tasks 15–22)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Đọc master trước khi thực thi; các lệnh deploy ở đây là kế hoạch, chưa được chạy trong phiên review.

**Goal:** Đưa candidate đã nghiệm thu lên cloud và bàn giao một URL thầy tự dùng được.

**Architecture:** Tiếp nối tám task của cloud plan ngày 2026-09-04, giữ Vercel frontend và Supabase backend riêng. Bổ sung dữ liệu demo, kiểm tra target, version manifest và acceptance từ góc nhìn người xem.

**Tech Stack:** Toolchain trong lockfile; GitHub Actions; Supabase Cloud; Vercel; Gemini phía Edge; Google Chrome cho nghiệm thu local đã được chọn.

**Resume checkpoint (2026-09-06):** Acceptance records mark Task 14 and Task 16 as accepted, and G19 as PASS for the approved fallback-only cloud smoke. The current resume is Task 20 (`19/22` task gates, not a product-completion percentage); reconcile the candidate/CI SHA before preview work. Historical snapshots remain labelled and do not silently become evidence for a newer candidate.

**Agent policy cập nhật:** controller/implementer **GPT-5.6 Luna / Max / Fast**; mọi reviewer R **GPT-6 Astra / High / Normal**. Astra chỉ vào khi có diff/evidence sẵn sàng review, giữ đủ gates của master; xác minh effective speed trước dispatch.

**Spec:** `2026-09-04-localens-public-thesis-demo-design.md`, cloud plan cùng ngày và rulings/master `2026-09-05-localens-integrated-luna-execution.md`.

## Global Constraints

- Áp dụng toàn bộ Global Constraints và giao thức review của master.
- Không remote reset, không tự đổi repository visibility, không ghi credential vào evidence.
- Chỉ cloud project demo riêng; chưa có quyền đích thì chuẩn bị cấu hình/diff trước, dừng tại mutation phụ thuộc.
- Không gọi provider thật trong unit/CI hoặc release `fallback-only`; protected smoke có budget riêng. `live-success` chỉ là thí nghiệm tùy chọn với opt-in và budget/evidence riêng.
- Phạm vi G19 được duyệt là `fallback-only` với `provider=0`: không yêu cầu provider thật hoặc `GEMINI_API_KEY`. `live-success` chỉ là thí nghiệm tùy chọn trong tương lai, tách khỏi release gate và phải có opt-in, budget và evidence riêng.
- Backend, frontend, seed và public env đều phải được nhận diện trong manifest.
- Sau mỗi bước hoàn thành, báo người dùng bốn mục: outcome, test/evidence và reviewer, next gate. Không dùng số task hoặc phần trăm task như tỷ lệ hoàn thành sản phẩm.

---

## Task 15 — Release candidate và đường thoát

**Phụ thuộc:** G14 PASS. **Owner:** C; R read-only. **Files:** sửa `docs/acceptance/thesis-demo-release.md`, `docs/runbooks/cloud-thesis-demo.vi.md` nếu đã tồn tại; tạo đúng hai path đó nếu chưa có. Không sửa file sản phẩm ở task này.

**Input:** product SHA + log G14. **Output:** release manifest candidate, không phải nhãn đã deploy.

- [ ] Đối chiếu SHA, dirty baseline, changeset của Task14 và artifact; đưa code đã kiểm tra về commit theo quyền task tổng. Ghi product SHA và evidence SHA riêng.
- [ ] Ghi trạng thái từng lớp: demo, local runtime, CI, cloud backend, preview, deployed. Chưa chạy là PENDING, không để checkbox mặc định xanh.
- [ ] Ghi danh sách migrations có thứ tự + checksum, hai Edge entrypoint và source hash, seed version, public build variables theo tên và nguồn, browser/tool versions.
- [ ] Ghi rollback hiện có: deployment trước đó nếu có; function version trước đó nếu có; AI kill switch hiện hữu. Release đầu tiên phải ghi “chưa có deployment trước”; phương án là tạm ngừng truy cập/phục vụ trang thông báo và tắt AI, không bịa một URL rollback.
- [ ] R so khớp manifest với `git show`, logs và local acceptance. C kiểm tra `git diff --check`.

**G15 PASS:** candidate nhận diện được và không có thay đổi implementation ngoài evidence. Task17/19 sẽ thêm seed/smoke code: candidate phải cập nhật sau các thay đổi đó. G15 là baseline local, không được coi SHA tại G15 bất biến cho toàn bộ cloud phase.

## Task 16 — Repository và CI

**Phụ thuộc:** G15. **Owner:** C/worker CI, khóa `.github/workflows/ci.yml` + `package.json`. **Files:** hai file trên nếu cần sửa; `docs/acceptance/thesis-demo-release.md`.

**Input:** repository hiện có và quyền đã ghi trong ledger. **Output:** CI kiểm tra đúng branch/SHA và link job/artifact.

- [ ] Đọc `git remote -v`, đối chiếu owner/repo với task tổng. Repository public hiện có là quyết định đã chấp thuận; không chạy lại bước create-private của plan cũ.
- [ ] Scan thay đổi và lịch sử sẽ công khai bằng scanner hiện có của dự án; xác minh scope scanner. Không chỉ grep working tree rồi tuyên bố toàn history sạch. Không in giá trị khớp secret; ghi loại/vị trí đã che.
- [ ] Đọc CI hiện tại, giữ static/unit/demo/local-runtime. Sửa command Windows/pnpm khi có bằng chứng; CI Linux dùng Corepack tương ứng. Không nâng dependency tiện tay.
- [ ] Job staging thiếu URL chưa được gọi là PASS. Tách rõ local quality xanh với cloud smoke chưa đủ điều kiện; task19/20 sẽ cấu hình target thật. Không xóa job hoặc đặt continue-on-error để che thiếu nghiệm thu.
- [ ] Job `staging-smoke` hiện chạy trên push/PR có thể thất bại khi URL rỗng: chuyển **toàn job** sang protected `workflow_dispatch` hoặc điều kiện target đã cấu hình. Trạng thái chưa chạy là SKIPPED/PENDING; không chỉ thêm `if` vào một step cuối còn step validate target vẫn chạy. G22 cần một run trên URL cuối đã PASS, không nhận SKIPPED.
- [ ] Push candidate chỉ trong phạm vi quyền đã có của task tổng. C kiểm tra job conclusion, head SHA, bước failure và artifact thật; ghi run URL.
- [ ] Nếu chỉ thay workflow, review workflow diff và xác minh job thực sự chạy các lệnh yêu cầu, không thêm unit test phản chiếu YAML chỉ để tăng số test.

**G16 PASS:** các gate local/CI được yêu cầu xanh trên candidate; cloud job chưa cấu hình được ghi PENDING riêng. Release G22 vẫn yêu cầu cloud smoke thật đạt.

## Task 17 — Dữ liệu và seeder dành cho thầy

**Phụ thuộc:** G16. **Owner:** A data/seed; C khóa package/config. **Files:**

- Tạo `data/demo/thesis-demo.v1.json` và `docs/runbooks/thesis-demo-data.md`.
- Tạo theo plan gốc `scripts/lib/thesis-demo-seed.mjs`, `scripts/seed-thesis-demo-cloud.mjs`, `tests/unit/supabase/thesis-demo-cloud-seed.test.ts`.
- Tạo migration timestamp mới `thesis_demo_manifest` cho `private.thesis_demo_manifest`: một row gồm `project_ref`, `environment` CHECK bằng `thesis-demo`, `dataset_version`, `seed_base_date`, `created_at`. Không grant đọc/ghi cho anon/authenticated; seeder dùng kết nối DB server đã kiểm tra. Marker tồn tại trong schema từ migration, row chỉ được insert cùng transaction apply dataset. Không tạo DDL ẩn trong seed.
- Tạo `supabase/tests/database/thesis_demo_manifest_test.sql`: kiểm environment CHECK, singleton marker, anon/authenticated không có quyền, rollback apply không để lại marker/dataset; chạy trên project DB cô lập cùng guard14.5 trước G17 PASS.
- Sửa `package.json`; chỉ extract helper từ `scripts/seed-runtime-auth.mjs`, `scripts/seed-runtime-fixed-tour.mjs` nếu cần; giữ nguyên guard local-only.
- Test hồi quy `tests/unit/supabase/runtime-auth-seed.test.ts`, `tests/unit/supabase/runtime-fixed-tour-seed.test.ts`.

**Input:** schema/migrations thực tế, nguồn dữ liệu cho phép. **Output:** `db:seed:thesis-demo-cloud`, manifest dataset có version, stable IDs, account roles; không có mật khẩu trong JSON.

### 17.A — Chốt dữ liệu và tiêu chí nguồn

- [ ] Chọn baseline 12 điểm/3 tour thử tại TP.HCM, đủ đầu vào cho các sở thích đã hỗ trợ. Nếu nguồn hiện có chưa đủ, dùng dataset hư cấu có nhãn rõ theo schema cho phép hoặc đề xuất giảm số điểm; không bịa bằng chứng venue/vendor.
- [ ] Mỗi bản ghi có ID ổn định; VI/EN; khu vực; mô tả; giờ/giá dùng trong demo; nguồn/license ảnh; loại `synthetic_demo` hoặc nguồn nghiên cứu đã được phép dùng và nhãn tương ứng. Đây là trường của manifest, không tự giả định là cột DB hiện có.
- [ ] Không sửa research catalog thành approved. Kiểm tra pipeline có cách xuất bản dataset thử riêng; nếu chưa có, thêm ranh giới demo rõ và test trước khi seed cloud, không tắt readiness gate chung.
- [ ] Ngày khởi hành seed dùng ngày cơ sở cố định của phiên demo theo `Asia/Ho_Chi_Minh` và offset hữu hạn +7/+14/+21 ngày. Lưu ngày cơ sở vào manifest để chạy lại không tự sinh thêm ngày/ID; trước buổi bảo vệ tạo version demo mới nếu ngày cũ đã hết, không rewrite booking cũ.
- [ ] Có ít nhất: một tour còn chỗ; một tour hết chỗ để nghiệm thu; customer chưa có booking; một booking chưa thanh toán cho case hủy; phân công guide hợp lệ. Dữ liệu reviewer không được gây hết chỗ cho phiên thầy thử sau đó.
- [ ] Tách `teacherDepartureIds` và `qaDepartureIds` trong manifest, hai tập không giao nhau. Smoke dùng **chỉ** customer.qa và QA departures: một departure capacity20 với4 slot chạy bằng stable run IDs `qa-01` đến `qa-04`, mỗi slot tối đa2seat committed; retries dùng lại booking/payment/cancel idempotency keys cùng slot. Hết4slot thì STOP, không tự thêm slot/reset/xóa booking. Teacher tours phải giữ nguyên số chỗ sau mọi QA run; xác minh read-only trước/sau. Case sold-out dùng QA departure riêng, không bán hết tour dành cho thầy.

### 17.B — Guard và các ranh giới giao dịch

- [ ] Viết RED: từ chối thiếu confirm, project sai, HTTP/loopback, TLS thiếu, DB URL không khớp project xác minh, user/data ngoài demo, password thiếu; bảo đảm không mutation trước guard.
- [ ] Dùng API/metadata để khớp project ref với kết nối DB; không suy project chỉ từ hostname vì pooler dùng hostname chung. Kiểm tra username/connection metadata do nền tảng cung cấp và marker target đã xác minh.

Verifier mới trong `scripts/lib/thesis-demo-seed.mjs` phải có contract cụ thể sau (schema tài liệu của module JS, không phải API Supabase sẵn có):

```ts
type VerifyDemoTargetInput = {
  expectedProjectRef: string;
  expectedOrganizationId: string;
  selectedProject: { id: string; organizationId: string; name: string };
  dashboardConnection: { projectRef: string; hostname: string;
    username: string; database: string; port: number };
  runtimeUrl: string;
  databaseConnection: { hostname: string; username: string;
    database: string; port: number; tlsVerified: boolean };
  inventory: { applicationDataRows: number; nonDemoApplicationRows: number; nonDemoAuthUsers: number;
    unexpectedObjects: readonly string[] };
  marker: { projectRef: string; environment: "thesis-demo"; datasetVersion: string } | null;
};
type VerifyDemoTargetResult =
  | { ok: true; projectRef: string; mode: "existing-demo" | "bootstrap-unseeded" }
  | { ok: false; code: "PROJECT_MISMATCH" | "CONNECTION_MISMATCH"
      | "TLS_REQUIRED" | "MARKER_MISSING" | "MARKER_MISMATCH" };
function verifyDemoTarget(input: VerifyDemoTargetInput): VerifyDemoTargetResult;
```

Nguồn độc lập: `selectedProject` đọc từ Management API/CLI đã login, so cả ID và organization; `dashboardConnection` lấy từ connection panel của **project đã chọn** hoặc API được tài liệu chính thức hỗ trợ, không suy từ connection string người dùng đưa vào. DB connection thực so đủ host/user/port/database/TLS với metadata đó; runtime URL phải đúng endpoint project. Shared pooler host chỉ trùng host chưa PASS. Metadata thiếu/sai, TLS không xác minh hoặc marker thiếu trên project đã có dữ liệu → fail closed. Không fallback sang hostname parsing.

Project mới chưa marker chỉ được `bootstrap-unseeded` nếu toàn bộ metadata độc lập đã khớp và inventory read-only chứng minh không có app/demo/user data ngoài baseline migrations; seeder apply đầu tạo marker trong transaction cùng dataset. Nếu không chứng minh được inventory thì `MARKER_MISSING`. Test shared pooler host nhưng username/ref khác, wrong organization, forged runtimeURL, missing independent metadata, marker mismatch và bootstrap có foreign data đều phải từ chối trước Auth mutation.

Inventory được query bằng kết nối đã đối chiếu, không nhập số0 thủ công. `nonDemoApplicationRows>0`, `nonDemoAuthUsers>0` hoặc unexpected objects đều từ chối ngay cả khi marker có sẵn; non-demo được định nghĩa bằng stable dataset IDs/allowed demo owners trong manifest, không chỉ bằng tên/email chứa chữ “demo”. Marker migration phải qua isolated SQL/privilege tests và cập nhật manifest migrations trước G18.
- [ ] Seeder chỉ chấp nhận `LOCALLENS_THESIS_DEMO_SEED_CONFIRM=localens-thesis-demo`. Secret nhập vào env phiên lệnh riêng; không lưu file plaintext trong repo.
- [ ] Stable identities: `customer.demo@localens.invalid`, `guide.demo@localens.invalid`, `admin.demo@localens.invalid` theo plan cũ, cộng **bắt buộc** `customer.qa@localens.invalid` để kiểm cross-owner. Manifest/apply expected count là **4 account, 3 vai trò**; account QA không đưa vào hướng dẫn thầy. Thêm secret env `LOCALLENS_DEMO_QA_CUSTOMER_PASSWORD` và guard thiếu password. Không tự reset mật khẩu account có sẵn khi rerun.
- [ ] Auth Admin API không cùng transaction PostgreSQL. Upsert Auth idempotent theo danh tính cố định, rồi transaction dữ liệu/roles; khi DB fail, ghi trạng thái khôi phục an toàn để rerun hoàn tất. Không tuyên bố DB rollback đã xóa Auth users.
- [ ] Dry-run không được tạo Auth user hoặc ghi DB: chỉ guard, dữ liệu manifest, schema, query read-only và `BEGIN/ROLLBACK`. Nếu account chưa tồn tại, ghi `DEFERRED_UNTIL_APPLY` cho postcondition phụ thuộc Auth; không giả vờ đã test FK account chưa tồn tại. Các thao tác thực/upsert chỉ ở apply và test DB cô lập.
- [ ] Seed transaction chỉ upsert stable demo IDs, đặt `statement_timeout`, chạy postconditions trước commit; không truncate/delete toàn schema hoặc ghi đè owner booking.
- [ ] Test chạy hai lần có cùng IDs/count; fail giữa Auth và DB rồi rerun; dữ liệu người dùng khác giữ nguyên; log không chứa token/password; dry-run không gọi Auth create/update.

Lệnh focused, sau khi các file test đã được tạo:

```powershell
corepack.cmd pnpm test:run tests/unit/supabase/thesis-demo-cloud-seed.test.ts tests/unit/supabase/runtime-auth-seed.test.ts tests/unit/supabase/runtime-fixed-tour-seed.test.ts --no-file-parallelism --testTimeout=30000
corepack.cmd pnpm db:static
```

**G17 PASS:** manifest dữ liệu review được; guard/idempotency/partial-failure tests và isolated SQL/privilege tests của marker xanh; local fixture giữ nguyên hành vi. `db:static:seed` research readiness bị chặn không phải lỗi để bypass. Cloud seed chưa chạy tại Task17.

## Task 18 — Supabase Cloud đúng project

**Phụ thuộc:** G17. **Owner:** C duy nhất chạy mutation cloud. **Files:** runbook/release evidence; `.temp/project-ref`, secret files tuyệt đối không commit.

**Input:** quyền tài khoản + project demo riêng + migrated candidate/seed. **Output:** remote backend đúng phiên bản, account/demo data được kiểm tra.

- [ ] Xem project hiện có qua tài khoản đã kết nối. Tái sử dụng project demo đúng mục tiêu nếu đã tạo; nếu thiếu quyền hoặc nhiều project cùng tên thì dừng trước link, không chọn ngẫu nhiên.
- [ ] Đọc CLI help chính phiên bản đang dùng và docs chính thức. Ghi project ID vào biến tác vụ cục bộ từ kết quả xác minh, không điền ID tưởng tượng vào lệnh.
- [ ] Kiểm tra migration history/drift bằng lệnh read-only trước; unexpected objects/data là BLOCKED. Sau đó dry-run `supabase db push --linked --dry-run`, review danh sách rồi push forward-only. Không gọi `db reset --linked` hoặc reset URL remote.
- [ ] Đối chiếu local/remote migration heads; triển khai đúng hai functions recommend/refine. Nếu idempotency cần schema mới, schema tương thích phải có trước functions mới.
- [ ] Tắt public signup; giữ email/password sign-in cho ba vai trò. Kiểm tra server từ chối unknown signup, không chỉ ẩn nút UI.
- [ ] Release fallback-only không yêu cầu `GEMINI_API_KEY`; chỉ đặt quota HMAC key và các secret bắt buộc cho boundary hiện hành. Nếu chủ dự án mở thí nghiệm `live-success` sau release, key Gemini phải được nhập trực tiếp vào secret store và model phải được ghim theo spec; thiếu key không được chặn G18/G19 fallback-only.
- [ ] Thiết lập origin allowlist fail-closed. Trong giai đoạn chưa có Vercel origin, một origin kiểm thử bootstrap tường minh có thể được dùng cho smoke HTTP có xác thực; không dùng wildcard. Origin browser thật sẽ được gắn ở Task20 và test lại.
- [ ] Chạy cloud seeder dry-run với env an toàn, xem refusal/postconditions, rồi real run. Postcondition bắt buộc **4 test identities/3roles**, đúng stable IDs gồm customer.qa; không nhận expected count3 từ plan cũ. Kiểm tra Auth roles/catalog/tours/teacher-vs-QA capacity read-only sau đó; chạy lại idempotency trên đúng dataset demo với account ổn định.
- [ ] Ghi project ref đã che phù hợp, region, migration head/checksum, function versions, seed manifest version/count và thời gian; không ghi connection string, JWT hay key.

Lệnh được dùng sau khi login/link đích đã xác minh, flag kiểm tra lại theo CLI hiện hành:

```powershell
corepack.cmd pnpm exec supabase migration list --linked
corepack.cmd pnpm exec supabase db push --linked --dry-run
```

Hai lệnh trên chưa phải lệnh push thật. Bước push thật và deploy dùng project đã được ràng buộc trong runbook, thực hiện tuần tự sau review dry-run. Một command exit 0 không thay thế việc đối chiếu remote version.

**G18 PASS:** backend đúng project/schema/functions, secrets đặt đúng nơi, seed/quyền kiểm tra được. Không dùng HTTP200 hoặc việc function “ACTIVE” thay cho G19.

## Task 19 — Cloud smoke có giới hạn

**Phụ thuộc:** G18. **Owner:** A viết runner; C hoặc Luna được ủy quyền chạy mutation trong dataset QA hữu hạn; R độc lập review và quan sát evidence. **Files:** tạo `scripts/smoke-thesis-demo.mjs`, `tests/unit/supabase/thesis-demo-smoke.test.ts`; sửa `package.json`, `.github/workflows/ci.yml`, runbook/evidence.

**Input:** target cố định, account demo, mode `fallback-only` đã được duyệt; `live-success` là opt-in cho thí nghiệm tương lai. **Output:** `smoke:thesis-demo` với kết quả từng gate, safe correlation IDs, không in response/token thô.

- [ ] RED cho refusal: target chưa xác minh, non-HTTPS, thiếu account, `live-success` thiếu opt-in, redirect sang host khác, secret xuất hiện trong log. Runner không tự seed/reset/link/deploy.
- [ ] Tách hai mode: release `fallback-only` bật kill switch và cho đúng **1 endpoint invocation, 0 provider attempts**; `live-success` chỉ là thí nghiệm tùy chọn, cho tối đa **2 provider attempts** (1 recommend + 1 refine) và tối đa4 mutation endpoint invocations gồm2 replay cùng operation. Auth/readback/denial probes có budget riêng tối đa20 HTTP requests và phải dừng trước provider. Không tự retry timeout hoặc tạo operation mới; count endpoint và provider riêng trong output.
- [ ] Case âm tính: không JWT, token invalid/expired, origin sai, payload sai, ID ngoài allowlist, owner khác đọc/sửa. Những input sai phải bị chặn trước provider khi phù hợp với boundary.
- [ ] Trong release `fallback-only`, đúng một recommend phải đọc lại proposal/plan/revision hợp lệ với `source/degraded` đúng và **0 provider attempts**. Hành vi refine cùng browser replay/readback được kiểm tra riêng ở G20/G21 trong budget QA hữu hạn, không biến thành provider smoke. Nếu chạy `live-success` như thí nghiệm riêng, recommend/refine phải giữ candidate IDs, locked IDs và revision invariant; provider success không phải điều kiện G19.
- [ ] Kiểm tra replay response-loss cùng operation không nhân plan/revision/quota. Thử bằng fault injection ở client/harness, không phá dữ liệu cloud bằng SQL trực tiếp.
- [ ] Chứng minh fallback cloud bằng kill switch trên project demo ở cửa sổ do C sở hữu: ghi trạng thái trước, tắt AI, gọi đúng một request xác định, xác minh source/degraded rồi khôi phục trong `finally` và đọc lại config. Request này không là live provider call. Không để job khác chạy trong cửa sổ config đổi.
- [ ] Booking/simulated payment/cancel/idempotency/quyền guide/admin smoke dùng dataset thử hữu hạn, ghi stable record IDs đã che cần thiết; không cleanup rộng hoặc dùng dữ liệu thầy đang thử.
- [ ] Nếu runner/CI thêm code sau G17, chạy focused unit/lint/typecheck và gate tích hợp chịu ảnh hưởng; cập nhật candidate/CI trước Task20. Không dán evidence cũ vào SHA mới.

```powershell
corepack.cmd pnpm test:run tests/unit/supabase/thesis-demo-smoke.test.ts --no-file-parallelism --testTimeout=30000
```

**G19 PASS:** cloud backend, `fallback-only` smoke, readback/quyền và provider-attempt count `0` đạt trên versions ghi manifest. Provider thật/Gemini key không phải điều kiện release; `live-success` là thí nghiệm tương lai tách riêng. HTTP smoke với bootstrap origin **không** chứng minh CORS browser/redirect URL; phần đó bắt buộc G20/G21.

**Resume/invalidation rule:** Push/reconcile candidate, CI head and current SHA is a routine evidence check and must remain separate from the protected finite cloud mutation smoke. Do not rerun the mutation smoke for a routine SHA check. Rerun it only when a relevant product/seed/smoke/env/deploy change invalidates G19 evidence; before any rerun, C verifies an unused QA slot, bounded dataset ownership and the finite request/provider budget. If those preconditions are absent, preserve the accepted G19 evidence and stop the mutation step.

## Task 20 — Vercel preview và hợp đồng origin

**Phụ thuộc:** G19 + candidate/CI cập nhật. **Owner:** C triển khai; B read-only kiểm tra env/bundle. **Files:** cấu hình deploy hiện có, runbook/evidence; không tự thêm server API bí mật mới.

- [ ] Reconcile the exact candidate SHA, CI head and release manifest before deployment. This routine push/CI/current-SHA check is separate from the protected finite cloud mutation smoke; only relevant code/config/seed changes invalidate the corresponding evidence.
- [ ] Đọc config hiện tại: build command, output mode, base paths, trailing slash, env validator. Không mặc định đây là Next.js SSR nếu repo đang static export.
- [ ] Kết nối repo đúng project Vercel trong quyền đã có. Đặt public runtime=supabase; URL Supabase Cloud/publishable key đúng project; APP_URL đúng origin trình diễn. Giá trị CI build-only không được xuất hiện ở preview.
- [ ] Turnstile prerequisite trước build: dùng no-Turnstile path được hỗ trợ khi `NEXT_PUBLIC_TURNSTILE_SITE_KEY` vắng; nếu có site key nonempty thì giữ nguyên cho domain đã cấu hình. Candidate hiện không có widget/token-verification integration, nên không thêm phantom service dependency và không gỡ bỏ auth/CAPTCHA protection nào. Phải có focused test/review cho behavior này; nếu chưa có thì dùng key thật/domain đã cấu hình hoặc giữ G20 BLOCKED. Không đặt chuỗi giả.
- [ ] Sau khi nhận URL preview, cấu hình Auth Site URL/redirect allowlist và Edge ALLOWED_ORIGINS chính xác; nếu public env được đóng vào build, rebuild artifact với giá trị đúng rồi nghiệm thu artifact mới.
- [ ] Test từ Chrome origin preview: login/logout, callback, recommend/refine, refresh/deep link, switch VI/EN, RLS readback. Kiểm tra allowlist thực và request headers; HTTP tool tự đặt Origin không thay thế bước này.
- [ ] Kiểm tra assets không missing, console không lỗi ứng dụng, không request localhost/LAN; preview không yêu cầu tài khoản Vercel của người xem nếu mục tiêu là thầy mở trực tiếp.
- [ ] Ghi deployment ID/URL, source SHA, build env fingerprint (không chứa secrets), backend manifest và ngày.

**G20 PASS:** candidate/CI SHA đã được đối chiếu, Turnstile path đã được chứng minh, preview chạy Supabase runtime bằng browser thật trong release `fallback-only` với `provider=0`, origin/auth đúng và không dùng fixture thay runtime khi lỗi.

## Task 21 — Nghiệm thu sản phẩm và bằng chứng đồ án

**Phụ thuộc:** G20. **Owner:** C hoặc Luna được ủy quyền chạy các browser mutation hữu hạn trong dataset QA; R độc lập review và quan sát evidence/read-only, không tự mutation. **Files:** `docs/design/qa/public-thesis-demo/README.md`; screenshot mới dưới thư mục đó; `docs/acceptance/thesis-demo-release.md`; tạo `docs/acceptance/thesis-demo-scenarios.md`, `docs/runbooks/teacher-walkthrough.vi.md`.

- [ ] Product Design audit chụp screenshot trạng thái trước khi kết luận về UX; dùng design/token hiện có. Ghi URL, viewport, locale, SHA/deployment, data state.
- [ ] Không generate lại cho từng viewport/locale chỉ để chụp ảnh. Dùng plan/revision đã được tạo và readback để kiểm layout. Release QA giữ `fallback-only` và 0 provider attempts; một phiên `live-success` chỉ là thí nghiệm riêng có opt-in, budget và evidence riêng. State lỗi cần fault injection chỉ ở harness/project demo có kiểm soát và ghi rõ nguồn bằng chứng, không giả lỗi local thành cloud evidence.
- [ ] Customer happy path và checkout: 3 viewport × 2 locale. Với error/quota/expired/stale: component/contract đầy đủ và một browser flow đại diện mỗi nhóm; bất kỳ nhóm có layout mới phải thêm screenshot 3 viewport.
- [ ] Admin/guide: kiểm tra route guard/role isolation ở mỗi locale, thao tác nghiệp vụ chính desktop; mobile/tablet smoke navigation/layout và hành động chính. Không quy test customer thành bao phủ cả vai trò khác.
- [ ] C hoặc Luna được ủy quyền thực hiện các browser scenario có mutation trong departures/slots QA đã tách; R chỉ quan sát, kiểm tra evidence và review độc lập. Không để reviewer tự làm thay mutation hoặc dùng dữ liệu teacher.
- [ ] Keyboard/focus/modal/error announcement, form labels, overflow, contrast, empty/loading/retry đều được review. Accessibility scanner là bằng chứng hỗ trợ, không chứng minh mọi vấn đề tương phản/thứ tự focus đã giải quyết.
- [ ] Chạy và điền ma trận 20 kịch bản dưới đây: expected, actual, environment, artifact, status. Không đánh PASS một case chỉ vì case gần giống đã chạy.
- [ ] Viết hướng dẫn 10 phút: mở web → chọn nhu cầu → login → generate → lock/refine → reload/reopen → chuyển sang tour cố định → payment giả → history; luồng phụ cancel + admin/guide.
- [ ] Đồng bộ báo cáo/UML theo behavior đã deploy; nếu sửa Word, tạo bản sao riêng. Ghi rõ planner không đồng nghĩa personal-trip checkout, refund không phải cancel trước payment, AI advisory và payment mô phỏng.

| Case | Kỳ vọng có thể kiểm tra |
|---|---|
| E01 | Anonymous xem home/catalog/tour; không bị bắt login quá sớm |
| E02 | Preset hợp lệ, ngày chưa quá hạn, budget hiển thị đơn vị người đọc hiểu |
| E03 | Customer login rồi tiếp tục đúng input; specialNeeds không ra provider |
| E04 | Chủ động generate một lần; UI khóa double click, có loading |
| E05 | Fallback-only dùng đúng candidate IDs và source label đúng; live provider chỉ là thí nghiệm tùy chọn |
| E06 | Duration/budget/party size và tổng tiền đúng invariant engine |
| E07 | Khóa điểm rồi refine; điểm khóa giữ nguyên theo contract |
| E08 | Reload/rời-trở lại mở cùng plan và revision mới nhất, không gọi AI mới |
| E09 | Feedback không hỗ trợ có hướng dẫn; không hứa đã áp dụng khi không áp dụng |
| E10 | Input không hợp lệ/không feasible/USD disabled có CTA sửa đúng |
| E11 | Mất response rồi retry không tạo trùng mutation/quota |
| E12 | Quota/fallback/AI tắt được ghi nhãn theo response thật |
| E13 | Phiên hết hạn, logout/account switch không lộ dữ liệu owner cũ |
| E14 | Tour cố định chọn chuyến còn chỗ, server xác nhận booking |
| E15 | Chuyến hết chỗ/booking stale bị chặn và có hướng xử lý |
| E16 | Payment mô phỏng thành công, replay trả cùng receipt; không nhập thẻ |
| E17 | Cancel trước payment đúng state; payment-vs-cancel giữ invariant |
| E18 | Account lịch sử đọc được booking; empty state rõ |
| E19 | Admin/guide đúng quyền và phần việc; cross-owner/role bị chặn |
| E20 | Link cuối/VI-EN/deep link/responsive/keyboard chạy bằng phiên mới |

Một case có thể cần nhiều probes. Báo cáo AI ghi số ca thật đã chạy, thành công/fallback/không feasible, thời gian quan sát và ràng buộc; không suy “AI tốt hơn” từ một screenshot. So sánh AI với deterministic trên cùng input chỉ khi có thiết kế đánh giá và ghi đúng số mẫu; đây là phân tích học thuật, không thêm một tính năng sản phẩm.

**G21 PASS:** 20 case có kết quả/evidence phù hợp cho release `fallback-only` với `provider=0`, không còn Critical/Important, product review không nhầm dữ liệu giả và runtime. Nếu sửa code lúc QA: quay lại task owner, test chịu ảnh hưởng và build/deploy candidate mới; rerun các case bị tác động trước PASS.

## Task 22 — URL cuối, rollback và bàn giao

**Phụ thuộc:** G21, CI candidate, quyền phát hành đã có. **Owner:** C; R kiểm chứng cuối. **Files:** release acceptance + runbooks + manifest.

- [ ] Chọn deployment/artifact đã qua G21. Kiểm tra APP_URL đã bake có phù hợp production origin hay không. Nếu phải rebuild thì đó là artifact mới: browser/auth/origin/critical flows phải nghiệm thu lại trước chốt release, không gọi là promote nguyên artifact.
- [ ] Ghi cùng `APP_URL` các header/marker phụ thuộc environment đã quan sát được: request `Origin`, auth/cookie mode, callback/redirect, `VERCEL_ENV`, `Strict-Transport-Security` (HSTS) và các CORS response headers liên quan; redact token/secret, không ghi giá trị nhạy cảm.
- [ ] Trước khi promote, thực hành preview stop/recovery trên môi trường kiểm soát: khôi phục function/frontend version tốt đã ghi, kiểm tra tương thích schema và chứng minh kill switch/đóng truy cập cho lần phát hành đầu nếu chưa có rollback version.
- [ ] Trước khi promote, chốt compatible version manifest cho frontend, migrations, seed và functions; ghi minimum-compatible function version. Edge version trước migration thu hồi quyền RPC ghi **không** là rollback target tương thích; chỉ rollback trong tập tương thích hoặc tắt truy cập và forward-fix. Không tự cấp lại quyền RPC cũ để làm rollback xanh.
- [ ] Promote theo quyền task tổng. Chốt ALLOWED_ORIGINS/Supabase Auth chỉ đúng preview cần giữ và production; không tăng wildcard để chữa lỗi.
- [ ] Sau khi promote, trên URL cuối thử bằng phiên mới: anonymous, login, một planner/readback, một fixed-tour/payment mô phỏng, role guard, locale/deep link. Release fallback-only giữ provider attempts `0`; live AI chỉ là thí nghiệm riêng có opt-in/budget, không tự retry vô hạn khi quota cạn.
- [ ] Xác minh nguồn không phụ thuộc PC phát triển: release `fallback-only` chỉ requests đến Vercel/Supabase; provider server chỉ xuất hiện trong thí nghiệm `live-success` đã opt-in. Nếu thử trên máy/mạng độc lập được thì ghi bằng chứng. Không tắt máy host đang có task chạy để “test”.
- [ ] Bàn giao link và tài khoản theo vai trò qua kênh riêng do chủ dự án quản lý; không public password admin. Tạo hướng dẫn khởi động demo offline đã kiểm chứng để dự phòng buổi bảo vệ.
- [ ] Ghi `thesis-demo-deployed@SHA` kèm deployment ID, functions/migrations/seed versions, evidence, hạn chế. Tách user sign-off: nếu chủ đồ án chưa thử URL thì chưa tick thay họ.

**G22 PASS kỹ thuật:** URL cuối usable, backend/version/evidence đúng, rollback khả thi, quyền và dữ liệu demo an toàn. Chỉ báo “sẵn sàng để thầy xem” khi các bước này đạt; HTTP200, static build hay fixture demo không đủ.

## Bảng invalidation để không test thừa hoặc dùng nhầm bằng chứng

| Thay đổi sau khi một gate đạt | Evidence phải làm lại |
|---|---|
| Copy thuần, không đổi layout/state | Review VI/EN; screenshot vùng bị đổi; không bắt chạy toàn DB suite |
| UI state/router/storage/runtime adapter | Focused behavior tests + type/lint + build + browser flows bị ảnh hưởng |
| Edge/quota/operation/RPC/schema | Unit/contract + isolated DB/RLS/concurrency + runtime itinerary; cloud redeploy/smoke |
| Booking/payment/cancel/assignment | DB/concurrency và fixed-tour/guide runtime tương ứng |
| Seed/data source | Seeder guards/idempotency + invariant dataset + flows dùng data đó |
| Env/origin/provider/model/deploy config | Build khi public env đổi; auth/browser/CORS/fallback smoke tương ứng; live provider chỉ khi thí nghiệm đó được mở riêng |
| Final candidate được thay nhiều nhóm | Một vòng gate local hoàn chỉnh theo Task14 rồi CI/preview acceptance trên candidate mới |

Tài liệu chính thức cần đọc ở thời điểm thực thi: [Supabase deploy](https://supabase.com/docs/guides/functions/deploy), [Supabase CLI](https://supabase.com/docs/reference/cli/introduction), [Vercel Next.js](https://vercel.com/docs/frameworks/full-stack/nextjs), [Gemini models](https://ai.google.dev/gemini-api/docs/models). Các URL này là nguồn kiểm tra tiếp theo, không phải bằng chứng các thao tác cloud trong plan đã được thực hiện.
