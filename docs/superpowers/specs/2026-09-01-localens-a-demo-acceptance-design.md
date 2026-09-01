# LocalLens A — Thiết kế nghiệm thu demo luận văn

**Trạng thái:** Mentor đã khóa thiết kế; chờ người dùng duyệt spec trước khi lập kế hoạch triển khai.

**Mục tiêu:** Hoàn thiện một bản LocalLens chạy local, song ngữ, có thể trình bày trọn vẹn các hành trình customer, guide và admin bằng dữ liệu giả lập có kiểm soát; mọi giới hạn demo, AI và thanh toán đều được nói đúng sự thật.

**Mốc tiếp theo:** Chỉ chuyển sang B — kiểm chứng Supabase/PostgreSQL runtime — sau khi A đạt toàn bộ cổng nghiệm thu trong tài liệu này.

## 1. Phạm vi và ranh giới sự thật

A là bản demo luận văn hoàn chỉnh, không phải production deployment.

- Dữ liệu chạy demo là fixture xác định, có nhãn `Demo` và không được trình bày như dữ liệu kinh doanh đã phê duyệt.
- Các bản ghi `research_only` không được xuất hiện như tour có thể đặt, báo giá hoặc thanh toán.
- AI demo chỉ xếp hạng, lập lịch và tinh chỉnh từ fixture do LocalLens quản lý; AI không tạo địa điểm, tour, giá hoặc chính sách kinh doanh mới.
- Use Case nghiệp vụ vẫn tên `Thanh toán`; UI, tài liệu và test phải nói rõ thao tác này được mô phỏng.
- Không dùng kết quả mock, unit test hoặc kiểm tra SQL tĩnh để tuyên bố Supabase, PostgreSQL, RLS, transaction lock hay concurrency đã chạy thật.
- A không yêu cầu tài khoản Supabase, Stripe, AI provider, domain hoặc deployment.

## 2. Baseline cần bảo toàn

Checkout triển khai là `codex/localens-mvp` trong worktree `localens/.worktrees/localens-mvp`.

- 11 page route hiện hữu bao phủ home, tours, planner, custom request, booking, sign-in, account, guide và admin.
- Baseline gần nhất đạt lint, typecheck, 893 Vitest test và Next.js production build.
- Playwright hiện có 23 case nhưng chưa xanh toàn bộ. Ba nhóm lỗi đã biết là contrast của dấu phân cách ngôn ngữ, food fixture không đi xuyên suốt luồng, và locator portal bị mơ hồ vì có hai fixture customer hợp lệ.
- 18 migration qua cổng kiểm tra tĩnh. Cổng DB runtime vẫn bị chặn bởi `SUPABASE_CLI_NOT_FOUND` và không thuộc Definition of Done của A.
- Các thay đổi tài liệu và artifact chưa commit trong worktree hiện tại thuộc về người dùng; quá trình triển khai không được reset, stash, discard hoặc gom chúng vào commit không liên quan.

## 3. Kiến trúc được chọn

Giữ nguyên Next.js và các ranh giới hiện có. Không viết lại ứng dụng hoặc tạo một state framework mới.

### 3.1 Fixture và contract

Một bundle fixture demo là nguồn duy nhất cho:

- danh tính customer, guide và admin;
- tour cố định, departure, capacity, giá và meeting point;
- địa điểm, lịch mở cửa, travel facts và dữ liệu món ăn demo;
- planner input, itinerary revision và locked stop;
- custom request, review decision, quote, booking và payment attempt;
- cancellation, assignment và review fixture cần cho portal.

Fixture dùng ID, timestamp và số tiền xác định. Mọi giá trị server-authoritative trong production được mô phỏng từ fixture hoặc use case; URL và form không được tự cấp giá, quyền, payment state hoặc sellability.

### 3.2 Use case và repository

Mỗi mutation đi theo thứ tự:

1. Parse input theo exact schema.
2. Xác thực demo session và actor.
3. Kiểm tra ownership/capability.
4. Kiểm tra state transition và thời hạn.
5. Tính hoặc đọc dữ kiện authoritative từ fixture.
6. Ghi atomically một demo state hợp lệ.
7. Trả projection đã làm sạch cho actor gọi.

UI không tự tính giá, không tự đổi trạng thái và không đọc toàn bộ repository. Production composition không được fallback im lặng sang demo repository.

### 3.3 UI

UI tiếp tục dùng các route và component hiện có. Thay đổi chỉ nhằm:

- kết nối các hành trình qua cùng nguồn state;
- hiển thị nhãn Demo nhất quán;
- biểu diễn đúng loading, success, empty, expired, invalid và retry;
- sửa accessibility, responsive và locator semantics;
- tránh refactor không phục vụ nghiệm thu A.

## 4. Session, lưu trữ và reset

- Handoff planner và custom request dùng `sessionStorage`, có exact schema, version và TTL 30 phút.
- Session theo từng tab; tab khác không được dùng nhầm role hoặc draft của tab hiện tại.
- Refresh trong TTL khôi phục đúng bước và đúng immutable revision.
- Payload malformed, quá lớn, future-dated, sai version, hết hạn hoặc fingerprint không khớp phải fail closed.
- Fixed-booking state hiện hữu có thể tiếp tục dùng browser storage qua boundary của nó, nhưng reset demo phải xóa đúng mọi key có namespace LocalLens demo.
- Reset không được gọi `clear()` và không được xóa storage không thuộc LocalLens.
- Direct-entry thiếu prerequisite phải hiển thị recovery UI có đường quay lại hợp lệ; không dựng state giả hoặc crash.

## 5. Hành trình nghiệp vụ

### 5.1 Tour cố định

Customer tìm kiếm/lọc tour demo, xem dữ kiện tour, chọn departure, số khách và ngôn ngữ. Booking dùng capacity và giá từ fixture. Cùng một booking request đang còn hiệu lực được resume thay vì tạo booking trùng.

### 5.2 Tour cá nhân hóa

Customer nhập nhu cầu; engine xác định xếp hạng và lập lịch từ fixture. Customer có thể refine và khóa stop. Mỗi revision là bất biến.

Customer phải chủ động xác nhận revision trước khi gửi custom request. Việc xác nhận là precondition của submission, không phải hành vi tự động hoặc quyền của admin. Request lưu đúng snapshot/fingerprint của revision đã xác nhận.

Admin có thể yêu cầu chỉnh sửa, duyệt hoặc từ chối. Chỉ request đã duyệt mới được tạo quote. Quote có snapshot bất biến, thời hạn 48 giờ và amount từ demo authority. Chỉ customer sở hữu request mới được chấp nhận quote và bắt đầu thanh toán.

### 5.3 Thanh toán mô phỏng đầy đủ

Không mở rộng production `BookingStatus`/`PaymentStatus` chỉ để phục vụ demo. Thay vào đó, lớp demo có payment-attempt outcome riêng:

- `pending`: session mô phỏng đang hiệu lực;
- `succeeded`: booking chuyển sang `paid`, payment chuyển sang `succeeded`;
- `failed`: attempt kết thúc nhưng booking hold còn hiệu lực và có thể thử lại;
- `cancelled`: customer rời checkout; booking hold còn hiệu lực và có thể thử lại;
- `expired`: payment session hết hạn; nếu booking hold còn hiệu lực thì có thể tạo attempt mới, nếu hold hết hạn thì phải tạo/resume booking theo policy hiện hữu.

Mỗi attempt có idempotency key. Replay cùng key trả lại cùng kết quả; attempt mới vẫn gắn với cùng booking và không tạo booking trùng. Một failure giữa chừng không được để booking ở trạng thái `paid` hoặc tạo payment thành công một phần.

### 5.4 Account, cancellation và review

Customer chỉ xem booking/request/quote của chính mình. Cancellation request chỉ được tạo ở trạng thái cho phép; admin quyết định nhưng không được giả làm customer. Review chỉ được tạo cho tour đã hoàn thành và chưa được review.

### 5.5 Guide

Guide chỉ xem fixed-tour assignment được giao và projection khách đã làm sạch. Guide không được xem payment, quote, booking của guide khác hoặc chức năng admin. Personalized-tour guide assignment vẫn được ghi rõ là chưa có production seam và không được trình bày như backend thật.

### 5.6 Admin

Admin quản lý request, quote, cancellation, demo operations và research queue trong đúng capability. Admin không được xác nhận itinerary, chấp nhận quote hoặc thanh toán thay customer. Research queue không có hành vi biến `research_only` thành sellable inventory trong A.

## 6. Phân quyền

Quyền được kiểm tra tại use-case/repository boundary, không chỉ bằng cách ẩn nút.

| Hành vi | Customer | Guide | Admin |
| --- | --- | --- | --- |
| Xem/sửa hồ sơ của mình | Có | Có | Theo capability admin đã định nghĩa |
| Tạo planner/request | Có | Không | Không |
| Xác nhận revision/chấp nhận quote/thanh toán | Chủ sở hữu | Không | Không |
| Xem assignment và cập nhật công việc được giao | Không | Chỉ assignment của mình | Theo capability vận hành |
| Review request/tạo quote/quyết định cancellation | Không | Không | Có |
| Publish `research_only` thành inventory | Không | Không | Không trong A |

Direct URL, forged ID, stale session, đổi role và cross-owner ID đều phải bị từ chối an toàn.

## 7. Error model và UX khôi phục

Use case trả lỗi có mã ổn định; UI ánh xạ mã lỗi sang EN/VI. Không dùng stack trace hoặc một thông báo chung cho mọi lỗi.

Phải cover:

- input thiếu/sai, date/party size không hợp lệ và capacity không đủ;
- itinerary không khả thi, locked stop không còn hợp lệ;
- missing, expired, invalid, tampered hoặc storage-unavailable session;
- stale revision, request sai trạng thái, quote hết hạn/thu hồi;
- payment failed/cancelled/expired và retry;
- ownership/capability violation;
- unsupported locale, missing translation và direct-entry thiếu prerequisite;
- lỗi bất ngờ, double click và reload giữa mutation.

Mutation đang chạy khóa thao tác lặp. Sau lỗi, UI giữ dữ liệu an toàn có thể phục hồi, đưa focus đến thông báo và cung cấp hành động cụ thể: thử lại, quay lại bước trước hoặc reset demo.

## 8. EN/VI, responsive và accessibility

- Mọi copy người dùng nhìn thấy có EN/VI; locale không hỗ trợ trả 404 đúng cách.
- Không để lộ key dịch hoặc fallback sang một ngôn ngữ khác một cách im lặng.
- Desktop, tablet và mobile không có horizontal overflow hoặc nội dung bị cắt.
- Điều khiển có accessible name; ảnh có alt phù hợp; heading và region có cấu trúc rõ.
- Keyboard có thể đi hết hành trình; focus visible và được chuyển hợp lý sau navigation/error/success.
- Text thường đạt contrast tối thiểu 4.5:1; text lớn đạt 3:1. Dấu phân cách trang trí không được bị test như text nội dung có contrast thấp.
- Hai fixture cùng role phải có locator ngữ nghĩa riêng; test không dựa vào `.first()` để che sự mơ hồ.

## 9. Chiến lược triển khai theo vertical slice

1. **Checkpoint và baseline:** bảo toàn file người dùng, cập nhật ledger theo code thật, chụp baseline test.
2. **Demo-state contract:** thống nhất fixture, reset, clock, session, payment attempt và typed errors bằng TDD.
3. **Sửa blocker E2E hiện hữu:** contrast separator, food handoff và semantic locator.
4. **Fixed-tour slice:** discovery → booking → năm payment outcomes → account.
5. **Personalized slice:** personalize → generate/refine/lock → confirm → request → admin decision → quote → payment.
6. **Portal/authority slice:** customer, guide, admin, direct-entry, cross-role/cross-owner và invalid transition.
7. **Acceptance slice:** EN/VI, ba viewport, keyboard, accessibility, reset, refresh, tamper và final evidence.

Mỗi slice dùng test-first, chỉ sửa code tối thiểu để qua contract của slice, chạy focused tests trước rồi mới chạy suite rộng. Không merge/push/publish nếu chưa có yêu cầu riêng của người dùng.

## 10. Cổng nghiệm thu A

A chỉ được gọi là hoàn thành khi tất cả điều kiện sau cùng đúng:

- `pnpm lint` pass với zero warning.
- `pnpm typecheck` pass.
- `pnpm test:run` pass toàn bộ.
- `pnpm build` pass.
- `pnpm db:static` pass; báo cáo vẫn nói DB runtime chưa được kiểm chứng.
- Toàn bộ Playwright suite pass, tối thiểu bao phủ 23 case baseline và mọi case mới thêm; kết quả cuối là `N/N`, zero failure.
- Fixed-tour và personalized-tour đều chạy trọn vẹn bằng EN và VI.
- Năm payment outcome được chứng minh; replay không tạo booking/payment trùng.
- Customer/guide/admin có kiểm tra positive và negative authority.
- Desktop, tablet, mobile đạt no-overflow, keyboard/focus và contrast gate.
- Demo reset và direct-entry recovery hoạt động ổn định.
- Không có console error/page error ngoài lỗi được test chủ động.
- Tài liệu, UI và test nhất quán về fixture, AI nội bộ và thanh toán mô phỏng.
- Demo được chạy lại từ một checkout sạch bằng lệnh được ghi trong README/runbook và được kiểm tra HTTP trước khi bàn giao.

## 11. Không thuộc A

- Supabase local/runtime, RLS, pgTAP, lock và concurrency verification.
- Stripe Test/live, webhook thật hoặc settlement.
- AI provider thật, secrets, quota hoặc billing.
- Approve/publish 30 địa điểm và 8 tour `research_only`.
- Production auth, deployment, domain, monitoring, backup hoặc disaster recovery.
- Personalized-tour guide assignment ở production.

Các mục này đi vào B hoặc milestone sau; không được lén mở rộng A.

## 12. Rủi ro và quyết định mentor

- **Rủi ro test xanh nhưng nghiệp vụ sai:** chặn bằng use-case tests và negative authority tests trước E2E.
- **Rủi ro fixture phân mảnh:** một fixture bundle và các projection dùng cùng ID/clock.
- **Rủi ro viết lại quá mức:** giữ kiến trúc hiện hữu, chỉ thêm contract/state cần cho nghiệm thu.
- **Rủi ro mock bị hiểu là production:** nhãn Demo trong UI, copy và báo cáo; cổng DB runtime tách riêng.
- **Rủi ro làm mất thay đổi:** commit theo slice, stage file tường minh, không reset/stash/discard worktree người dùng.
- **Rủi ro E2E chậm/flaky:** deterministic clock/data, một worker cho visual evidence, semantic locators và không phụ thuộc mạng.

Quyết định mentor là hoàn thành A theo bảy vertical slice ở trên, nghiệm thu bằng cổng đo được, rồi mới thiết kế B. Đây là đường ngắn nhất để có một sản phẩm luận văn đáng tin mà không đánh tráo demo thành production.
