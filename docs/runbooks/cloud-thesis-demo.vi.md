# Runbook phát hành cloud cho đồ án LocalLens

## Mục tiêu hiện tại

Runbook này khóa release candidate backend cloud
`d5b8ea89b5ffddbca9e0d0a0d0f960a7920afca6` trên nhánh công khai
`codex/task7-clean-typecheck` của
[Uyen-Pha/localens](https://github.com/Uyen-Pha/localens).

Task 18 đã nghiệm thu một Supabase Cloud project riêng cho đồ án: migration,
Auth, Edge Functions, secret/config và dataset tổng hợp đều có readback. Gemini
thật vẫn tắt; chưa có Vercel preview hoặc production URL được nghiệm thu.
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
| Candidate SHA | `d5b8ea89b5ffddbca9e0d0a0d0f960a7920afca6` |
| Task 17 seed product SHA | `caeb182acceb9a3c5b4604500de7a5b732925de2` |
| Task 17 acceptance SHA | `f476e83c40c1b8ee65df696f6a1fd9e7654332ba` |
| Task 18 cloud-guard SHA | `5bba6564e80bb3abf259409c475d2f81e000a4b3` |
| Task 18 hosted-migration SHA | `d5b8ea89b5ffddbca9e0d0a0d0f960a7920afca6` |
| Migration head | `20260905140000_thesis_demo_manifest.sql` |
| Public CI | [Run 33983849459](https://github.com/Uyen-Pha/localens/actions/runs/33983849459) — PASS |
| Trình duyệt nghiệm thu | Google Chrome `152.0.7977.65` |

Manifest checksum đầy đủ nằm trong
[`../acceptance/thesis-demo-release.md`](../acceptance/thesis-demo-release.md).

## Kiểm tra trước mỗi phiên làm cloud

Chạy các lệnh đọc-only sau từ đúng checkout. Nếu SHA hoặc nhánh khác, dừng và
cập nhật candidate thay vì dùng bằng chứng cũ.

```powershell
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --short
git rev-parse origin/codex/task7-clean-typecheck
git merge-base --is-ancestor d5b8ea89b5ffddbca9e0d0a0d0f960a7920afca6 HEAD
git diff --name-only d5b8ea89b5ffddbca9e0d0a0d0f960a7920afca6..HEAD
gh repo view Uyen-Pha/localens --json nameWithOwner,visibility,url,defaultBranchRef
gh run view 33983849459 --json status,conclusion,headSha,url,jobs
corepack.cmd pnpm --version
corepack.cmd pnpm exec supabase --version
```

Kỳ vọng trước mọi mutation cloud tiếp theo:

- nhánh `codex/task7-clean-typecheck`;
- local HEAD và remote branch cùng SHA; candidate `d5b8ea8` là ancestor, và
  các commit sau candidate chỉ được đổi tài liệu release đã review;
- repo `PUBLIC`;
- CI `success` trên đúng head;
- pnpm `10.17.1`, Supabase CLI `2.115.0`;
- dirty baseline chỉ gồm các path được liệt kê trong release ledger cộng với
  thay đổi của task đang thực hiện.

Không sửa cấu hình Git toàn cục. Commit phát hành mới phải dùng GitHub no-reply
theo cơ chế tạm thời của từng lệnh commit.

## Ma trận trạng thái phải cập nhật

Sau mỗi gate, cập nhật `docs/acceptance/thesis-demo-release.md` bằng trạng thái
thật và bằng chứng thật:

| Lớp | Trạng thái hiện tại | Điều kiện để đổi sang PASS |
| --- | --- | --- |
| Fixture demo | PASS | Giữ Chrome E2E xanh trên candidate mới. |
| Local runtime | PASS | Giữ DB/RLS/concurrency/auth/AI-contract/fixed-tour/guide xanh trên candidate mới. |
| Public CI | PASS | Tất cả job bắt buộc xanh trên đúng HEAD. |
| Supabase Cloud | PASS | G18: 31/31 migration, 2 Function v1/JWT, Auth khóa signup công khai, 4 custom secret/config và seed graph exact. |
| Live AI smoke | PENDING | G19 có request Gemini thật giới hạn, fallback và quyền/readback. |
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
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Site key thật, không rỗng và hợp lệ cho domain. Candidate hiện tại chưa có chế độ tắt đã được code/test chứng minh. |
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
| `LOCALLENS_GEMINI_ENABLED` | `0` để tắt AI, `1` để bật AI thật khi đã có key. |
| `GEMINI_API_KEY` | Chỉ bắt buộc khi AI bật; chủ dự án cấp qua secret store. |
| `GEMINI_MODEL` | Nếu đặt, phải đúng `gemini-3.6-flash`. |

`LOCALLENS_GEMINI_TEST_ENDPOINT_BASE` chỉ dùng cho local acceptance. Không đặt
biến này trên Supabase Cloud.

## Trình tự Tasks 16–22

### Task 16 — Repository và CI

1. Xác minh remote/owner/visibility và quét secret trên toàn history sẽ public.
2. Đối chiếu CI với candidate; giữ local quality, Chrome demo và isolated
   runtime.
3. Staging smoke thiếu URL phải ở trạng thái PENDING/SKIPPED rõ ràng; G19 vẫn
   yêu cầu bounded live-AI cloud smoke và G22 yêu cầu smoke riêng trên URL
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

Kết quả G18 ghi nhận ngày 2026-09-06:

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
- readback cuối có 31 version local/remote và `db push --dry-run --skip-vault`
  trả về up-to-date;
- `recommend-itinerary` và `refine-itinerary` đều `ACTIVE`, version `1`,
  `verify_jwt=true`;
- bốn custom secret/config đã đặt là `ALLOWED_ORIGINS`, `GEMINI_MODEL`,
  `LOCALLENS_GEMINI_ENABLED`, `LOCALLENS_QUOTA_HMAC_KEY`; Gemini đang tắt và
  `GEMINI_API_KEY` chưa tồn tại;
- Email provider vẫn bật, confirm-email bật; public signup, anonymous sign-in
  và manual linking đều tắt theo dashboard readback;
- seed chạy `dry-run -> apply -> apply` trên kết nối TLS được xác thực. Lượt đầu
  tạo bốn Auth identity, lượt hai tái sử dụng cả bốn; postcondition là 4 account,
  4 role row thuộc 3 role category, 12 place, 3 tour, 5 departure, 2 booking,
  1 assignment, 1 marker, 86 relation, 0 unclassified row, graph `exact`;
- không có reset/truncate/down migration; Supabase local trình chiếu trên cổng
  chuẩn không bị chạm. Thanh toán vẫn chỉ là dữ liệu mô phỏng.

### Task 19 — Cloud smoke giới hạn

1. Runner phải từ chối target sai, HTTP, thiếu opt-in, redirect host khác và
   log chứa secret.
2. Live-success tối đa 2 provider attempts; fallback-only đúng 0 provider
   attempt.
3. Kiểm auth/RLS/replay/quota/readback và fixed-tour/payment mô phỏng trên QA
   slots hữu hạn; không phá dữ liệu thầy.
4. Tắt AI bằng kill switch trong cửa sổ kiểm soát, smoke fallback, khôi phục
   trong `finally`, rồi đọc lại trạng thái.
5. Ghi correlation ID đã che và số request; không lưu response/token thô.

### Task 20 — Vercel preview

1. Link đúng Vercel project với repo/candidate đã xác minh.
2. Đặt public env thật; build Supabase runtime, không dùng placeholder CI.
   Turnstile phải có site key hợp lệ; nếu muốn chế độ tắt thì phải triển khai,
   test và phát hành candidate mới trước.
3. Sau khi có preview origin, cập nhật Supabase Auth URL/redirect và
   `ALLOWED_ORIGINS` chính xác, rồi rebuild nếu public env đã bake vào bundle.
4. Dùng Google Chrome trên preview để kiểm login/logout, recommend/refine,
   reload/deep link, VI/EN, assets, console và request destinations.

### Task 21 — Product QA cloud

1. Product Design audit phải chụp screenshot cloud trước khi kết luận.
2. Kiểm 20 kịch bản theo release plan, đủ customer/admin/guide, locale,
   responsive, keyboard/focus và error/retry.
3. Không gọi AI thật lặp lại chỉ để chụp nhiều viewport; dùng readback cùng
   revision đã tạo.
4. Nếu sửa code, quay lại owner/gate tương ứng, deploy candidate mới và rerun
   các case chịu ảnh hưởng.

### Task 22 — Production và bàn giao

1. Chọn đúng artifact đã qua G21; nếu rebuild thì nghiệm thu artifact mới.
2. Promote, khóa origins/redirect, rồi smoke bằng phiên mới trên URL cuối.
3. Thực hành rollback/stop path và xác minh schema/function compatibility.
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

Hiện chưa có deployment trước để rollback. Tám GitHub deployment record
`staging` cũ đều có trạng thái cuối `failure` và không có environment URL; đó
không phải Vercel deployment hoặc rollback target.

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
