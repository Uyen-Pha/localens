# LocalLens B — Thiết kế sản phẩm runtime thực

**Trạng thái:** Mentor tự chốt theo yêu cầu tiếp tục đến khi sản phẩm chạy thực tế.

**Mục tiêu:** Chuyển LocalLens A từ demo trình duyệt sang một bản luận văn chạy với Supabase/PostgreSQL thật, auth và RLS thật, dữ liệu bền vững và quy trình kiểm chứng có thể lặp lại; sau đó chuẩn bị đường triển khai staging mà không đánh tráo local runtime thành production.

## 1. Định nghĩa hoàn thành

LocalLens B có ba nhãn bằng chứng tách biệt:

- `runtime-verified-local`: Supabase local chạy trong container, toàn bộ migration được replay, pgTAP/RLS/concurrency/type-drift gate đạt và ứng dụng đọc/ghi qua runtime thật.
- `staging-deployed`: schema, Edge Functions và web app được triển khai vào một project staging HTTPS, có auth test và smoke test từ bên ngoài máy phát triển.
- `production-deployed`: chỉ dùng khi có domain, secrets, backup, monitoring, rollback và kiểm tra sau triển khai. B không tự nhận nhãn này nếu người dùng chưa cung cấp hạ tầng.

Server Next.js dùng fixture hoặc localStorage không thỏa bất kỳ nhãn nào ở trên.

## 2. Phạm vi nghiệp vụ

- Giữ hai loại tour: tour cố định và tour cá nhân hóa do customer khởi tạo.
- AI vẫn là engine nội bộ xếp hạng/lập lịch từ dữ liệu LocalLens đã duyệt; không thêm nhà cung cấp AI bên ngoài.
- Giữ `Thanh toán mô phỏng` theo phạm vi luận văn. Trạng thái booking/payment phải được tạo và lưu phía server; không thu tiền thật và không mô tả như Stripe production.
- Customer chỉ thao tác dữ liệu của mình; guide chỉ thấy assignment được giao; admin chỉ dùng capability quản trị đã định nghĩa.
- Không tự đổi địa điểm/tour `research_only` thành sellable. Catalog runtime chỉ seed dữ liệu đã được con người xác minh và phê duyệt.

## 3. Kiến trúc được chọn

### 3.1 Runtime mode rõ ràng

Ứng dụng có hai composition tách biệt:

- `demo`: chỉ dùng khi `NEXT_PUBLIC_LOCALLENS_RUNTIME=demo`; giữ fixture A cho trình diễn offline và E2E xác định.
- `supabase`: dùng khi `NEXT_PUBLIC_LOCALLENS_RUNTIME=supabase`; yêu cầu URL và publishable key hợp lệ, không được fallback sang demo khi cấu hình hoặc request lỗi.

Production build không được mặc định sang demo. Màn hình lỗi cấu hình phải fail closed và không lộ secret.

### 3.2 Biên repository

UI phụ thuộc vào các port nghiệp vụ thay vì gọi localStorage hoặc Supabase trực tiếp. Mỗi port có hai adapter:

- demo adapter hiện hữu;
- Supabase adapter gọi named projection/RPC và map qua exact schema hiện hữu trong `lib/infrastructure/supabase/`.

Các nhóm port là session/auth, catalog, planner/revision, custom request/quote, checkout/payment, customer portal, guide portal và admin portal. Adapter không nhận actor ID, amount, sellability hoặc state authority từ form.

### 3.3 Auth và session

Supabase Auth là nguồn session ở runtime. Browser dùng publishable key, PKCE và JWT người dùng; không có service-role key trong bundle. Role lấy từ profile/role projection do RLS bảo vệ, không lấy từ nút chọn role hoặc query string.

Sign-in runtime dùng email/password cho tài khoản seed local xác định. Demo identity picker chỉ xuất hiện ở mode `demo`.

### 3.4 Database và mutation

18 migration hiện hữu là schema baseline. Mọi mutation nghiệp vụ đi qua guarded RPC hoặc Edge boundary đã kiểm thử; browser không ghi trực tiếp bảng stateful. Migration mới chỉ được thêm khi runtime test chứng minh một seam còn thiếu.

Lock order, idempotency, immutable snapshot, quote expiry, capacity hold, payment monotonicity và ownership phải được kiểm tra bằng PostgreSQL thật. Static SQL check không thay thế pgTAP hoặc two-session harness.

### 3.5 Next.js runtime

Mode `supabase` không dùng static export vì auth/session và dữ liệu thay đổi theo request. Mode `demo` vẫn có thể static export. Build config quyết định rõ theo runtime mode; không suy luận từ `NODE_ENV` rồi âm thầm đổi hành vi.

## 4. Dữ liệu và seed

Seed được chia thành hai lớp:

1. `runtime-test seed`: tài khoản customer/guide/admin và dữ liệu kỹ thuật tối thiểu, được đánh dấu test-only, chỉ dùng trên loopback local để kiểm tra RLS và luồng ứng dụng.
2. `approved catalog seed`: chỉ được sinh từ bundle có approval, source hash, giờ mở cửa, availability, giá và support map đầy đủ.

Runtime-test seed không được xuất hiện như inventory công khai ngoài môi trường local. Catalog hiện tại vẫn `research_only`, nên Phase B không sửa cờ sellable hoặc ký approval thay con người.

## 5. Luồng dữ liệu

### Tour cố định

Customer đăng nhập → đọc published tour/departure projection → tạo hold bằng RPC với idempotency key → chạy payment simulation phía server → xem booking của chính mình. Hai session đồng thời không được oversell.

### Tour cá nhân hóa

Customer tạo plan/revision → engine xếp hạng dữ liệu đã duyệt → customer xác nhận revision → gửi request → admin review/tạo quote từ facts phía server → owner chấp nhận quote → checkout mô phỏng. Snapshot/fingerprint và hạn 48 giờ được database cưỡng chế.

### Portal

Customer, guide và admin dùng projection riêng. Cross-owner, cross-guide, self-escalation, forged ID và direct base-table access đều bị từ chối tại database, không chỉ ẩn UI.

## 6. Error và phục hồi

- Runtime/config lỗi: hiển thị trạng thái service unavailable có correlation ID; không fallback demo.
- Auth hết hạn: làm mới session một lần, sau đó đưa về sign-in và giữ draft an toàn nếu có thể.
- Conflict/idempotency: resume resource hiện hữu hoặc trả lỗi conflict xác định; không tạo bản ghi trùng.
- Quote/hold hết hạn: UI đọc lại authoritative state và cung cấp hành động hợp lệ.
- Network timeout: mutation dùng idempotency key, retry không nhân đôi booking/payment.
- RLS denial: thông báo access denied chung cho người dùng, log chỉ mã sự kiện đã redacted.

## 7. Bảo mật

- Chỉ publishable key được phép vào browser; service role, database password và provider secrets là server/Edge-only.
- CORS allowlist, body limit, content-type, bearer parsing và redacted logging dùng gateway hiện hữu.
- RLS được `ENABLE` và `FORCE` theo matrix; grants và definer ownership phải khớp manifest.
- Local stack chỉ bind loopback và không được expose ra mạng công cộng.
- Staging dùng HTTPS, secrets của platform và tài khoản test riêng; không dùng dữ liệu cá nhân thật.

## 8. Kiểm thử và nghiệm thu

### B1 — Database runtime gate

- Docker-compatible runtime và project-local `supabase@2.115.0` hoạt động.
- `pnpm db:static:seed` chỉ pass với runtime-test seed hợp lệ hoặc approved catalog thật; không bypass approval.
- `pnpm db:verify` pass toàn bộ: start, reset, lint, pgTAP, two-session concurrency, generated type drift và stop cleanup.
- Mỗi lỗi runtime phát hiện phải có regression test trước khi sửa migration/script.

### B2 — Application runtime gate

- Supabase mode không import demo repository trong production composition.
- Auth thật cho ba role local; role và ownership đến từ database.
- Fixed-tour và personalized-tour có EN/VI E2E qua runtime thật.
- Refresh hoặc browser mới vẫn thấy dữ liệu bền vững; reset browser không xóa database.
- Cross-owner/cross-role E2E bị từ chối và database test đồng thời chứng minh RLS.
- `pnpm check`, demo E2E và runtime E2E đều pass; mode A không regression.

### B3 — Staging gate

- Chỉ bắt đầu khi người dùng cung cấp hoặc đăng nhập Supabase staging và hosting target.
- Migration deploy bằng quy trình reviewable, không reset remote.
- Smoke test HTTPS, auth, RLS, headers, logs và rollback evidence được ghi lại.

## 9. Trình tự giao hàng

1. Cài WSL/container runtime bằng quyền hệ thống được người dùng chấp thuận; không tự reboot.
2. Thêm project-local Supabase CLI đã pin và chạy B1 để tìm lỗi migration/runtime thật.
3. Tạo runtime-test seed tách biệt, không thay approval catalog.
4. Hoàn thiện two-session harness và generated database types.
5. Tạo runtime composition/auth rồi nối từng vertical slice bằng TDD.
6. Chạy review độc lập, full verification và mở demo Supabase mode.
7. Khi có credentials, triển khai staging theo một spec/plan riêng.

## 10. Blocker cần quyền ngoài repository

- Máy hiện chưa có WSL, Docker/Podman hoặc Supabase CLI. Cài WSL/container runtime là thay đổi hệ thống và có thể yêu cầu UAC/reboot.
- Không có Supabase staging URL/key/access token/project ref hoặc hosting credentials trong môi trường.
- Catalog 30 địa điểm/8 tour vẫn là research draft; chỉ người chịu trách nhiệm dữ liệu mới được xác nhận nguồn và phê duyệt publication.

Các blocker này không ngăn việc hoàn thiện code/runtime-test local sau khi container runtime được cài, nhưng ngăn mọi tuyên bố `staging-deployed` hoặc inventory thương mại đã sẵn sàng.
