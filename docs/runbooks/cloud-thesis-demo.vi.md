# Runbook phát hành cloud cho đồ án LocalLens

## Mục tiêu hiện tại

**Checkpoint 2026-09-06:** tiếp tục Task 20; không làm lại Task 14. Vercel project
`local-lens2/localens` đã có deployment `BV7tybWR2pUrDS2sV5KAsoj1BKyh` tại
`b58f426`, phục vụ `https://localens-ashen.vercel.app`. Đây là quan sát dashboard,
chưa thay thế nghiệm thu G20/G21/G22. Push CI `34021339001` đã đạt trên SHA đó;
hai dispatch sau đó lỗi ở protected cloud smoke. Nhánh
`codex/task7-clean-typecheck` đang tự deploy production: candidate sửa tiếp dùng
`codex/thesis-release-final` và phải nghiệm thu preview trước khi phát hành.
Các SHA và trạng thái bên dưới là lịch sử nghiệm thu Task 19.

Runbook này khóa release candidate cloud-smoke
`ef485673b2f90280d1717cf2a3a1b597ae44157b` trên nhánh công khai
`codex/task7-clean-typecheck` của
[Uyen-Pha/localens](https://github.com/Uyen-Pha/localens).

Task 18 đã nghiệm thu một Supabase Cloud project riêng cho đồ án. Các điều kiện
tiên quyết phía Supabase của Task 19 hiện đã sẵn sàng: 32/32 migration, Auth, hai
Edge Function version 3, secret/config và dataset tổng hợp `thesis-demo.v2` đều
có readback. AI cloud đã được nghiệm thu ở chế độ fallback demo; không cần gọi
Gemini thật hoặc lưu key nhà cung cấp. Chưa có Vercel preview hoặc production
URL được nghiệm thu.
Thanh toán luôn là mô phỏng; không cấu hình cổng thanh toán hoặc thu thập số thẻ.

## Ranh giới an toàn bắt buộc

- Không chạy `db reset`, `demo:runtime --prepare`, truncate, down migration hay
  seed thử vào project remote.
- Không dùng Supabase trình chiếu `localens-mvp` trên các cổng chuẩn làm target
  test disposable. Gate local chỉ dùng project và cổng ngẫu nhiên do runner sở
  hữu.
- Không chọn Supabase/Vercel project theo tên gần giống. Phải đối chiếu project
  ID, organization, URL và metadata kết nối từ nguồn độc lập.
- Không commit `.env`, token, mật khẩu, connection string, service-role key,
  Gemini key hoặc file liên kết máy cục bộ.
- Không in giá trị secret vào log. Tài liệu chỉ ghi tên biến và trạng thái.
- Không dùng wildcard cho `ALLOWED_ORIGINS` hoặc redirect allowlist.
- Không đổi model sang `latest` hay tự chọn model khác nếu model ghim chưa được
  xác minh; dừng và ghi blocker.
- Không gọi HTTP 200, Function `ACTIVE`, static build hay fixture demo là bằng
  chứng staging/production.
- Không stage rộng bằng `git add -A`. Luôn dùng danh sách path tường minh và giữ
  nguyên dirty baseline trong release ledger.

## Bản ứng viên đã khóa

| Thành phần | Giá trị |
| --- | --- |
| Candidate SHA | `ef485673b2f90280d1717cf2a3a1b597ae44157b` |
| Task 17 seed product SHA | `caeb182acceb9a3c5b4604500de7a5b732925de2` |
| Task 17 acceptance SHA | `f476e83c40c1b8ee65df696f6a1fd9e7654332ba` |
| Task 18 cloud-guard SHA | `5bba6564e80bb3abf259409c475d2f81e000a4b3` |
| Task 18 hosted-migration SHA | `d5b8ea89b5ffddbca9e0d0a0d0f960a7920afca6` |
| Migration head | `20260905150000_thesis_demo_qa_slots.sql` |
| Public CI | [Run 34012526072](https://github.com/Uyen-Pha/localens/actions/runs/34012526072) — PASS |
| Trình duyệt nghiệm thu | Google Chrome `152.0.7977.65` |

Manifest checksum đầy đủ nằm trong
[`../acceptance/thesis-demo-release.md`](../acceptance/thesis-demo-release.md).

## Kiểm tra trước mỗi phiên làm cloud

Chạy các lệnh đọc-only sau từ đúng checkout. `ef48567` là implementation
candidate đã có CI; HEAD có thể chứa commit chỉ sửa release evidence sau đó.
Nếu phần code/workflow/seed khác candidate, dừng và tạo candidate cùng CI mới.

```powershell
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --short
git rev-parse origin/codex/task7-clean-typecheck
git merge-base --is-ancestor ef485673b2f90280d1717cf2a3a1b597ae44157b HEAD
git diff --name-only ef485673b2f90280d1717cf2a3a1b597ae44157b..HEAD
gh repo view Uyen-Pha/localens --json nameWithOwner,visibility,url,defaultBranchRef
gh run view 34012526072 --json status,conclusion,headSha,url,jobs
corepack.cmd pnpm --version
corepack.cmd pnpm exec supabase --version
```

Kỳ vọng trước mọi mutation cloud tiếp theo:

- nhánh `codex/task7-clean-typecheck`;
- local HEAD và remote branch cùng SHA; candidate `ef48567` là ancestor, và
  các commit sau candidate chỉ được đổi tài liệu release đã review;
- repo `PUBLIC`;
- CI `success` trên đúng implementation candidate `ef48567`; nếu bất kỳ code,
  workflow, seed hoặc smoke runner nào đổi thì phải chạy CI trên candidate mới;
- pnpm `10.17.1`, Supabase CLI `2.115.0`;
- dirty baseline chỉ gồm các path được liệt kê trong release ledger cộng với
  thay đổi của task đang thực hiện.

Không sửa cấu hình Git toàn cục. Commit phát hành mới phải dùng GitHub no-reply
theo cơ chế tạm thời của từng lệnh commit.

## Ma trận trạng thái phải cập nhật

Sau mỗi gate, cập nhật `docs/acceptance/thesis-demo-release.md` bằng trạng thái
thật và bằng chứng thật:

Tiến độ tổng hiện tại: **19/22 — 86%**. Task 20 vẫn đang thực hiện.

| Lớp | Trạng thái hiện tại | Điều kiện để đổi sang PASS |
| --- | --- | --- |
| Fixture demo | PASS | Giữ Chrome E2E xanh trên candidate mới. |
| Local runtime | PASS | Giữ DB/RLS/concurrency/auth/AI-contract/fixed-tour/guide xanh trên candidate mới. |
| Public CI | PASS | Tất cả job bắt buộc xanh trên đúng implementation candidate. |
| Supabase Cloud | PASS | G18 và điều kiện G19: 32/32 migration, 2 Function v3/JWT, Auth khóa signup công khai, quota-HMAC đúng và seed graph `thesis-demo.v2` exact. |
| AI demo cloud smoke | PASS | G19 fallback-only đã pass; `provider=0`, không gọi Gemini thật. |
| Vercel preview | PENDING | G20 có deployment ID, URL và Chrome browser-origin acceptance. |
| Product QA cloud | PENDING | G21 hoàn thành 20 kịch bản và bằng chứng UX. |
| Production | PENDING | G22 có URL cuối, rollback rehearsal và owner sign-off. |

Không chuyển trạng thái PENDING thành PASS chỉ vì bước đó bị skip.

## Biến public cho frontend

Các giá trị phải lấy từ đúng dashboard/project đã xác minh và đặt trong Vercel.
Không ghi giá trị vào tài liệu hoặc Git.

| Tên biến | Nguồn |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Origin Vercel đã chọn và nghiệm thu. |
| `NEXT_PUBLIC_LOCALLENS_RUNTIME` | Giá trị cố định `supabase`. |
| `NEXT_PUBLIC_SUPABASE_URL` | API URL HTTPS của project Supabase đã xác minh. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key của cùng project. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Tùy chọn: có thể bỏ hẳn khi không dùng Turnstile. Parser và admin initialization đã được kiểm thử với key vắng mặt; không dùng key giả. |
| `NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES` | Chỉ dành cho runner E2E. Bắt buộc **không tồn tại** trên preview/production; không đặt thành `0`. |

Không dùng `sb_publishable_ci_build_only` hoặc `ci-build-only` ngoài CI build.
Không mang `NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES=1` lên cloud vì biến này bật
dữ liệu/hành vi fixture ở browser.

## Secret/config chỉ dành cho Edge

| Tên | Quy tắc |
| --- | --- |
| `SUPABASE_URL` | URL của đúng project đích. |
| `SUPABASE_ANON_KEY` | Lấy từ đúng project, không commit. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret store only; không đưa ra browser. |
| `LOCALLENS_QUOTA_HMAC_KEY` | Secret riêng, đủ entropy, không tái sử dụng mật khẩu. |
| `ALLOWED_ORIGINS` | Danh sách origin HTTPS tường minh; tối đa theo validator hiện tại. |
| `LOCALLENS_GEMINI_ENABLED` | `0` là cấu hình release demo; fallback deterministic là đường chạy được nghiệm thu. |
| `GEMINI_API_KEY` | Không cần cho release thesis-demo fallback; không nhập key chỉ để chạy lại gate. |
| `GEMINI_MODEL` | Nếu đặt, phải đúng `gemini-3.6-flash`. |

`LOCALLENS_GEMINI_TEST_ENDPOINT_BASE` chỉ dùng cho local acceptance. Không đặt
biến này trên Supabase Cloud.

## Trình tự Tasks 16–22

### Task 16 — Repository và CI

1. Xác minh remote/owner/visibility và quét secret trên toàn history sẽ public.
2. Đối chiếu CI với candidate; giữ local quality, Chrome demo và isolated
   runtime.
3. Staging smoke thiếu URL phải ở trạng thái PENDING/SKIPPED rõ ràng; G19 đã
   pass ở phạm vi AI demo fallback và G22 vẫn yêu cầu smoke riêng trên URL
   production cuối.
4. Nếu workflow hoặc code thay đổi, tạo candidate SHA mới và chạy CI lại.

### Task 17 — Dataset đồ án có version

1. Tạo dataset source-approved hoặc `synthetic_demo` có nhãn rõ, stable IDs và
   dataset version.
2. Thêm marker schema `private.thesis_demo_manifest` bằng migration mới.
3. Tạo seeder guard fail-closed, dry-run không mutation, apply idempotent và
   postcondition 4 account, 4 role row thuộc 3 role category.
4. Chạy SQL privilege/rollback test trong project local cô lập; không cloud
   seed ở task này.
5. Vì đây là thay đổi code/schema, cập nhật candidate, checksum và CI.

### Task 18 — Supabase Cloud

1. Kiểm tra tài khoản đang login và liệt kê project bằng lệnh read-only.
2. Chọn đúng project theo ID + organization + metadata; nếu mơ hồ thì dừng.
3. Xem `supabase --help` của phiên bản hiện hành trước khi dùng flag.
4. Chạy migration inventory và `db push --linked --dry-run`; review từng
   migration. Không push nếu có drift/đối tượng lạ/dữ liệu ngoài demo.
5. Push forward-only, deploy `recommend-itinerary` rồi `refine-itinerary`, đặt
   secret/config, tắt public signup và xác minh lại.
6. Chạy cloud seeder dry-run rồi apply trên đúng marker/project; kiểm tra
   idempotency và dữ liệu thầy/QA tách biệt.

Hai lệnh sau chỉ được chạy sau khi link target đã được xác minh:

```powershell
corepack.cmd pnpm exec supabase migration list --linked
corepack.cmd pnpm exec supabase db push --linked --dry-run --skip-vault
```

Không chạy `db reset --linked`.

Kết quả G18 và phần chuẩn bị cloud của G19 ghi nhận ngày 2026-09-06:

- tài khoản có đúng một project `localens-thesis-demo`, gói Free, vùng
  Singapore và trạng thái `ACTIVE_HEALTHY`; project ref/organization ID không
  được ghi vào Git;
- migration 4 đã commit schema nhưng lần chạy đầu không ghi được history do
  `RESET ROLE` làm mất session role của hosted CLI. Candidate `d5b8ea8` loại
  session-level reset, giữ `SET LOCAL ROLE postgres`, vượt 1.952 unit tests và
  public CI. Chỉ sau khi truy vấn read-only xác minh toàn bộ object của migration
  4 đã tồn tại và history còn thiếu, operator mới dùng `migration repair
  --status applied` cho đúng một version theo tài liệu Supabase; 27 migration
  còn lại được push forward-only;
- readback cuối có 32 version local/remote và `db push --dry-run --skip-vault`
  trả về up-to-date;
- `recommend-itinerary` và `refine-itinerary` đều `ACTIVE`, version `3`,
  `verify_jwt=true`;
- bốn custom secret/config đã đặt là `ALLOWED_ORIGINS`, `GEMINI_MODEL`,
  `LOCALLENS_GEMINI_ENABLED`, `LOCALLENS_QUOTA_HMAC_KEY`; Gemini đang tắt và
  `GEMINI_API_KEY` chưa tồn tại;
- Email provider vẫn bật, confirm-email bật; public signup, anonymous sign-in
  và manual linking đều tắt theo dashboard readback;
- seed v2 chạy `dry-run -> apply -> apply` trên kết nối TLS được xác thực. Cả
  hai lượt apply tái sử dụng bốn Auth identity; postcondition là 4 account,
  4 role row thuộc 3 role category, 12 place, 3 tour, 5 departure, 2 booking,
  1 assignment, 1 marker, 87 relation gồm 4 QA slot, 0 unclassified row, graph
  `exact`;
- mỗi Function được deploy từ allowlist tạm đúng 38 file, upload 35 asset đã
  ghim và không chứa `.git`, `.next`, secret hay file dự án không liên quan;
- digest quota-HMAC hiện khớp bundle mã hóa. Không cast trực tiếp PowerShell
  `SecureString` thành text; phải chuyển in-process và không bao giờ in giá trị;
- probe valid-body thiếu/sai JWT trên cả hai Function đều trả `401`; các probe
  này không dùng QA slot, quota AI hay tạo mutation sản phẩm;
- không có reset/truncate/down migration; Supabase local trình chiếu trên cổng
  chuẩn không bị chạm. Thanh toán vẫn chỉ là dữ liệu mô phỏng.

### Task 19 — Cloud smoke giới hạn — PASS (AI demo fallback)

**Trạng thái: PASS cho phạm vi AI demo fallback.** Candidate `ef48567` đã
chuyển runner sang `thesis-demo.v2`; migration 32, hai Function version 3 và
seed v2 đã được cập nhật/readback trên đúng cloud target. Run `34012526072`
đã pass `fallback-only` với `provider=0`; không có claim hoặc yêu cầu về
request Gemini thật.
Thanh toán vẫn hoàn toàn mô phỏng.

Registry v2 giữ đúng bốn slot deterministic `qa-01` đến `qa-04`: `qa-01` dành
cho payment và gắn recommend operation; `qa-02` dành cho cancellation và gắn
refine operation; `qa-03` dành riêng cho fallback; `qa-04` là slot dự phòng thứ
tư. Payment và cancellation dùng hai booking tách biệt, không thanh toán rồi hủy
cùng một booking và không tích hợp cổng thanh toán thật.

`live-success` yêu cầu confirmation `RUN_LIVE_THESIS_DEMO`. Runner phải xác minh
exact target qua Management API rồi đăng nhập đủ bốn tài khoản trước. Trước mọi
request có thể tới provider, runner gọi Management API
`/database/query/read-only` và chỉ tiếp tục khi đọc đúng cả bốn row registry,
marker `thesis-demo.v2`, đúng project đã xác minh, đúng QA owner và role
`customer` của owner đó. Assignment không được đổi: recommend dùng operation
của `qa-01`, refine dùng operation của `qa-02`.

Trước và sau từng operation, runner gọi RPC `get_runtime_planner_operation` bằng
service role để attest các count của operation, planner reservation, Gemini
reservation, recommendation run và provider attempt. Delta persisted này là
bằng chứng replay cùng operation không nhân quota/provider attempt; không suy
diễn provider count chỉ từ response endpoint. `fallback-only` yêu cầu
`RUN_FALLBACK_THESIS_DEMO`, dùng một operation hữu hạn của slot spare chưa từng
chạy (bản pass `34012526072` đã tiêu thụ `qa-03`; workflow hiện mặc định chọn
`qa-04`), có đúng một planner invocation; attestation trước/sau phải chứng minh không tạo Gemini
reservation và không có provider attempt. Cả sáu request Management API để đọc
secret, tắt, xác minh, khôi phục và đọc lại kill switch đều đi qua HTTP counter
có giới hạn. Live mode cố ý loại bỏ response primary đã hoàn tất trước khi cho
phép đúng một replay byte-identical; chỉ envelope replay mới được kiểm tra.
Runner vẫn không seed/reset/link/deploy, không theo redirect và không in token,
secret hoặc response thô.

Bằng chứng local hiện tại gồm **47/47** focused smoke unit test, **172/172**
supporting Supabase/remediation test và **259/259** Edge/AI-related test sau bản
thêm lựa chọn slot fallback dự phòng. Public CI `34012526072` PASS trên đúng candidate và
protected cloud smoke ghi nhận `pre_provider=13`, `evidence=15`,
`management=6`, `planner=1`, `provider=0`, `product_mutations=0`.
Đây là bằng chứng cloud fallback demo, không phải live-provider integration.

Nếu workflow bị hard-cancel, runner hoặc máy bị kill khiến `finally` không thể
chạy, người giữ protected environment phải phục hồi thủ công trước mọi lần chạy
khác:

1. xác nhận job serialized đã dừng và không còn cloud smoke nào đang chạy;
2. xác minh lại đúng project ref/name, rồi qua Supabase Dashboard hoặc cơ chế
   quản trị được bảo vệ đặt `LOCALLENS_GEMINI_ENABLED=0` làm trạng thái an toàn;
3. đọc lại secret/config và xác nhận giá trị đang là `0`, không chụp/in token hay
   response body;
4. chỉ khôi phục `1` khi owner phê duyệt, Gemini key/origin đã sẵn sàng và không
   có job cạnh tranh; sau đó đọc lại trạng thái một lần nữa.

GitHub job `thesis-demo-cloud-smoke` chỉ xuất hiện trên `workflow_dispatch`, dùng
protected environment cùng tên, concurrency group cố định và
`cancel-in-progress: false`. Trước khi cho phép job chạy, repository owner phải:

1. environment hiện dùng reviewer owner `Uyen-Pha`,
   `prevent_self_review=false` và branch policy đúng candidate; đây là gate do
   owner xác nhận, không phải review độc lập;
2. đặt `LOCALLENS_THESIS_DEMO_RELEASE_REFS` thành danh sách chính xác các
   `refs/heads/...`, `refs/tags/...` hoặc SHA được duyệt, phân tách bằng dấu phẩy
   hoặc dòng mới; candidate branch không được tự động tin chỉ vì không phải
   default branch;
3. environment `thesis-demo-cloud-smoke` hiện đã có required reviewer, branch
   policy đúng candidate, năm biến URL/project/release-ref/origin và sáu secret
   publishable/service-role/bốn mật khẩu; `SUPABASE_ACCESS_TOKEN` được dùng
   trong bước smoke bảo vệ;
4. không cần thêm `GEMINI_API_KEY` cho release fallback-only. Nếu chạy
   `live-success` trong tương lai, đó là thí nghiệm riêng phải được phê duyệt
   và không thuộc acceptance của thesis-demo này.

Push/PR thông thường không chạy staging hoặc cloud smoke, không nhận cloud
secret và không tiêu quota AI. Migration 32, Function, seed v2 và cấu hình
protected environment đã được chứng minh; G19 đã đổi sang PASS sau run
protected `fallback-only` với đủ evidence replay/attestation, permission,
readback, request budget, device identity và khôi phục kill switch. Local GREEN
không phải cloud acceptance.

### Task 20 — Vercel preview

1. Tái sử dụng đúng Vercel project với repo/candidate đã xác minh. Đối chiếu
   production branch trước push; không đẩy candidate chưa review vào nhánh đó.
2. Đặt public env thật; build Supabase runtime, không dùng placeholder CI.
   Candidate mới cho phép bỏ biến Turnstile khi ứng dụng không tích hợp
   Turnstile; giá trị đã cung cấp vẫn phải không rỗng. Không đặt key giả.
3. Sau khi có preview origin, cập nhật Supabase Auth URL/redirect và
   `ALLOWED_ORIGINS` chính xác, rồi rebuild nếu public env đã bake vào bundle.
4. Dùng Google Chrome trên preview để kiểm login/logout, recommend/refine,
   reload/deep link, VI/EN, assets, console và request destinations.
5. CI push kiểm tra đúng SHA độc lập với smoke cloud. Dispatch kiểm tra web để
   `run_cloud_smoke=false`; chỉ bật khi thay đổi làm mất hiệu lực evidence cloud
   và đã đọc lại slot chưa dùng. Khi bật phải có confirmation đúng mode. Không
   lặp `qa-04` hoặc reset registry để chữa lỗi slot đã dùng. Ghi rõ URL HTTP smoke
   không thay thế browser acceptance có đăng nhập.

### Task 21 — Product QA cloud

1. Product Design audit phải chụp screenshot cloud trước khi kết luận.
2. Kiểm 20 kịch bản theo release plan, đủ customer/admin/guide, locale,
   responsive, keyboard/focus và error/retry.
3. Release dùng fallback xác định, `provider=0`; E05 kiểm tra candidate IDs,
   nhãn nguồn và readback đúng, không yêu cầu Gemini thật. Dùng cùng revision
   cho ảnh nhiều viewport. Thử provider thật là thí nghiệm riêng ngoài release.
4. Nếu sửa code, quay lại owner/gate tương ứng, deploy candidate mới và rerun
   các case chịu ảnh hưởng.

### Task 22 — Production và bàn giao

1. Trước promote, thực hành stop/recovery trên preview, ghi version Function
   tương thích schema và chứng minh phục hồi. Không đụng dữ liệu trình chiếu.
2. Chọn artifact đã qua G21; kiểm APP_URL và headers phụ thuộc VERCEL_ENV
   (gồm HSTS). Nếu rebuild thì nghiệm thu artifact mới.
3. Promote, khóa origins/redirect, rồi smoke bằng phiên mới trên URL cuối.
4. Bàn giao URL và tài khoản qua kênh riêng; không public admin password.
5. Chỉ phát hành nhãn `thesis-demo-deployed@<SHA>` khi mọi bằng chứng đủ.

## Candidate invalidation

Nếu có thay đổi sau candidate đã khóa:

- copy thuần: review VI/EN và screenshot vùng đổi;
- UI/router/storage/adapter: unit + lint/type + build + browser flow liên quan;
- Edge/RPC/schema/quota: contract + isolated DB/RLS/concurrency + runtime AI;
- booking/payment/cancel/guide: DB concurrency + fixed-tour/guide runtime;
- seed/data: seeder guard/idempotency + dataset invariants + flow dùng dữ liệu;
- env/origin/provider/deploy: rebuild nếu public env đổi + auth/CORS/provider
  smoke;
- nhiều nhóm thay đổi: chạy lại đầy đủ Task 14 và public CI.

Mỗi lần candidate đổi, cập nhật product/evidence SHA, migration checksum,
Function source hash, seed version, CI run và deployment IDs. Không tái sử dụng
nhãn hoặc screenshot của SHA cũ.

## Rollback/đường thoát cho lần phát hành đầu

Ngày 2026-09-06 đã quan sát deployment Vercel `BV7tybWR2pUrDS2sV5KAsoj1BKyh`
tại `b58f426`, nhưng chưa nghiệm thu tính tương thích để dùng làm rollback target.
Tám GitHub deployment record `staging` cũ có trạng thái cuối `failure` và không
có environment URL vẫn không phải rollback target.

1. Tắt Gemini bằng `LOCALLENS_GEMINI_ENABLED=0`, đọc lại config và kiểm fallback.
2. Nếu frontend không an toàn, tạm ngừng public access hoặc phục vụ trang bảo
   trì qua hosting; không bịa URL rollback.
3. Nếu Function không an toàn, đóng truy cập hoặc forward-deploy bản tương
   thích đã kiểm tra.
4. Database luôn forward-only; dừng traffic và forward-fix, không reset remote.
5. Sau deployment đầu tiên, phải ghi deployment ID/version tốt tối thiểu và
   rehearsal trước khi gọi release hoàn tất.

## Phần chủ đồ án cần giữ quyền

Codex có thể thực hiện code, kiểm thử, CLI deploy và ghi evidence trong phạm vi
đã duyệt. Chủ đồ án cần đăng nhập hoặc cấp quyền hợp lệ cho tài khoản Supabase,
Vercel và Gemini khi gate tương ứng bắt đầu; nhập secret qua dashboard/secret
store hoặc phiên lệnh riêng, không gửi mật khẩu/token vào Git hay tài liệu.

User sign-off cuối chỉ do chủ đồ án xác nhận sau khi tự mở URL và thử luồng.
Agent không tự tick thay bước này.
