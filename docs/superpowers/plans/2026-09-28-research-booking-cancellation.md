# Research booking cancellation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện Hủy đơn trên chính luồng research của website, có bằng chứng local từ SQL đến giao diện.

**Architecture:** Tái sử dụng bảng/RPC research và hai adapter hiện có. SQL bổ sung riêng cho research, không chuyển đơn sang public.bookings. Giao dịch Hủy dùng cùng thứ tự khóa với thanh toán, lưu lịch sử bất biến; giao diện chỉ trình bày và gửi xác nhận.

**Tech Stack:** PostgreSQL 17, Supabase local/pgTAP, Node 24, pnpm 10.17.1, TypeScript/React, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-research-booking-cancellation-design.md`

## Global Constraints

- Chỉ local. Không hosted SQL, backfill, merge main, push hoặc deploy trong kế hoạch này.
- Giữ nguyên giao diện, thông tin đã thanh toán, deadline và revision gắn với đơn; không hoàn tiền tự động.
- Không sửa các worktree nguồn, design-qa.md, tsconfig.tsbuildinfo hoặc phần việc không thuộc phạm vi.
- Lỗi baseline ghi riêng; không nới quyền hoặc bỏ kiểm thử.
- Research payment_status=pending nghĩa là chưa thanh toán; không tái dùng máy móc enum của luồng khác.
- Dùng corepack.cmd pnpm; áp SQL chỉ khi đã xác minh project local riêng và port riêng.

## Review Focus

- Đơn cũ: deadline/nội dung không bị viết lại khi nâng cấp hoặc chạy lại SQL — Task 1/2.
- Revision yêu cầu đã đổi: điều kiện hủy vẫn lấy revision gắn với đơn — Task 2/3.
- Thanh toán xong trước Hủy: cho phép hủy nếu >=48h; không coi mọi payment-first là phải thất bại — Task 2.
- Lỗi mạng sau commit: gửi lại cùng khóa không thêm lịch sử, không báo thành công giả — Task 2/3.
- Thiếu RPC trên môi trường chưa nâng cấp: không mất danh sách đơn, không chuyển sang demo — Task 3.

## Phân công và thứ tự

Main/PM giữ phạm vi, kiểm tra Word và thực thi Docker/SQL. Dev 1 thực hiện SQL/harness. Dev 2 thực hiện adapter/UI sau khi hợp đồng Task 2 ổn định. QC 1 review SQL/đồng thời; QC 2 review adapter/UI. Không agent nào tự push/deploy/áp hosted. Reviewer không sửa file; mỗi dev chỉ ghi trong tập file được giao.

### Task 1: Dựng đúng schema research gốc, không dựng luồng giả

**Files:** tạo `scripts/test-research-cancellation-local.mjs`; tạo `supabase/tests/fixtures/research-baseline/README.md` và các bản SQL phụ thuộc đã xác minh trong cùng thư mục (không tự đưa vào migrations phát hành).

**Interfaces:** harness nhận `--workdir <absolute-local-directory>`, project ID/port lấy từ config của thư mục đó; từ chối URL remote, từ chối project của các stack cũ. Xuất danh sách nguồn/hash/schema cần thiết, không xuất khóa bí mật.

- [ ] Đọc đầy đủ SQL research ở worktree localens-guide-release, từ `20260916073000_research_demo_catalog.sql` đến `20260924180000_research_quote_checkout.sql`; truy vết từng dependency và replacement, không chỉ chọn theo tên file.
- [ ] Ghi danh sách nguồn/hash và quan hệ phụ thuộc trong README. Chỉ sao chép dependency cần thiết vào fixture baseline. Nếu thiếu nguồn, dừng báo; không tạo bảng/RPC giả để vượt kiểm thử.
- [ ] Viết kiểm thử harness từ chối remote/stack cũ, lỗi khi thiếu RPC booking/checkout và không tự reset database. Chạy test để thấy thất bại trước khi thêm harness.
- [ ] Dựng project local mới, áp baseline, xác nhận tạo/đọc/thanh toán một đơn bằng RPC research. Giữ dữ liệu cũ mẫu để Task 2 nâng cấp.
- [ ] QC 1 kiểm tra baseline và phạm vi; commit đúng file Task 1 khi các kiểm tra liên quan đạt.

### Task 2: Hủy research nguyên tử và tương thích nâng cấp

**Files:** tạo `supabase/migrations/20260928230000_research_booking_cancellation.sql`, `supabase/tests/database/research_booking_cancellation_test.sql`, `scripts/test-research-cancellation-concurrency.mjs`; cập nhật harness Task 1 để áp SQL mới sau baseline.

**Interfaces:** `public.research_demo_cancel_booking(p_booking uuid, p_idempotency_key text) RETURNS jsonb`; trả booking hiện có cộng `cancelled_at` nullable, `trip_start_at` nullable từ revision đã gắn. Cả `research_demo_booking` và `research_demo_checkout` giữ chữ ký/payload cũ, bổ sung cùng các trường này để UI không đoán thời gian. Lịch sử riêng `private.research_demo_booking_cancellations` có booking_id duy nhất, actor_id, cancelled_at, idempotency_key và previous_status; uniqueness(actor_id,idempotency_key).

- [ ] Viết pgTAP gọi RPC thật: pending trước/đúng/sau expires_at; confirmed paid ở 47h/48h/49h; chủ khác/guide/admin; thời gian thiếu/sai; replay cùng/khác khóa trên đơn đã hủy; cùng khóa khác đơn; giữ paid_at/số tiền; không ghi lịch sử khi từ chối.
- [ ] Biên thời gian chính xác dùng một hàm policy nội bộ thuần nhận authority_time rõ ràng; RPC truyền clock_timestamp sau khóa. Hàm nội bộ không được browser gọi. Kiểm thử đúng 48h tại policy SQL và RPC ở hai phía; không giả vờ đồng hồ thực có thể đứng yên đúng một thời điểm.
- [ ] Chạy test RED do thiếu API/contract. Thêm trạng thái cancelled, lịch sử/constraints/RLS/grant tối thiểu. Không UPDATE các dòng đơn cũ khi áp migration.
- [ ] Kiểm tra vai trò sở hữu, search_path rỗng, timeout, quyền tạm thời được thu hồi; lịch sử chỉ ghi từ RPC, không UPDATE/DELETE bởi browser. Đặt khóa chống lặp theo actor/key trước khóa request rồi booking; xác minh không đảo thứ tự so với đường checkout.
- [ ] Tái sử dụng điều kiện của thanh toán research, chỉ sửa phần khóa/đọc lại trạng thái cần thiết; không thay luật Planner/duyệt/quote. Khi đơn cancelled, checkout không tạo paid mới.
- [ ] So sánh toàn bộ các trường nghiệp vụ của fixture cũ trước/sau upgrade. Chạy lại SQL và so sánh lần nữa; kiểm tra constraints/view/RPC thực tế chứ không chỉ regex.
- [ ] Harness hai kết nối gọi chính research_demo_checkout/cancel: cancel-first, payment-first 47h, payment-first 49h, hai cancel cùng/khác khóa. Assert trạng thái paid/cancelled và số lịch sử cuối, không helper tự UPDATE thay thanh toán.
- [ ] Không đưa test research vào gate mặc định khi dependency baseline chưa có: harness phải dựng đủ schema trước khi chạy test mới, báo rõ baseline nguồn chưa được đưa vào release migrations. Không thay test công khai hiện có để che lỗ hổng coverage.
- [ ] QC 1 review code/quyền và kết quả thực thi; commit file Task 2 sau xác minh. Báo riêng mọi dependency migration còn thiếu của nhánh phát hành, chưa coi là sẵn sàng phát hành.

### Task 3: Nối hai adapter và nút Hủy vào UI hiện tại

**Files:** sửa `lib/infrastructure/supabase/research-demo-adapter.ts`, `research-request-adapter.ts`, `components/customer/research-quote-checkout.tsx`, `components/customer/personalized-request-page.tsx`; tạo component dùng chung `components/customer/research-cancel-booking-dialog.tsx` và test tương ứng trong `tests/components/customer/`; cập nhật `tests/unit/supabase/research-request-adapter.test.ts`, thêm `tests/unit/supabase/research-demo-cancellation.test.ts`.

**Interfaces:** hai port bổ sung `cancelBooking(bookingId:string,idempotencyKey:string):Promise<ResearchBooking>`; booking nhận status cancelled và nullable/optional cancelled_at, trip_start_at. Gọi đúng RPC Task 2, không gọi public.cancel_booking. Trường mới thiếu ở backend cũ: vẫn đọc booking, confirmed thiếu trip_start_at không hiện hành động Hủy.

- [ ] Test RED: parse cancelled ở cả hai adapter, gửi đúng ID/key, không coi RPC lỗi là thành công, không fallback local state.
- [ ] Thêm trạng thái/adapter; giữ response cũ hợp lệ. UI dùng trip_start_at từ booking, không dùng startAt của revision yêu cầu hiện tại để quyết định hủy confirmed.
- [ ] Component test: Quay lại không gọi RPC; Xác nhận gọi một lần; bấm lặp bị khóa; lỗi mạng giữ key cho retry; tải lại thấy cancelled thì không thanh toán lại; RPC chưa sẵn sàng hiển thị lỗi dễ hiểu.
- [ ] Thêm nút/hộp xác nhận dùng style hiện có. Không thay bố cục trang hoặc tạo luồng hoàn tiền.
- [ ] QC 2 review giao diện/contract và test; commit file Task 3 sau xác minh.

### Task 4: Tích hợp và bàn giao kết quả local

**Files:** cập nhật `docs/recovery/2026-09-28-cancellation-local-impact.md` bằng kết quả mới, phân biệt public.bookings và research.

- [ ] Chạy harness research upgrade/pgTAP/concurrency trên đúng project riêng; chạy suite cũ trên project sạch khác để tránh dữ liệu concurrency làm sai các test đếm tổng.
- [ ] Chạy `corepack.cmd pnpm typecheck`, lint chỉ các TS/TSX/MJS đã thay đổi, Vitest targeted adapter/component và toàn bộ test command nếu điều kiện cho phép; ghi từng lỗi baseline, không tuyên bố toàn xanh từ test trọng tâm.
- [ ] Chạy `corepack.cmd pnpm build:supabase` với cấu hình local/build-only, không dùng dữ liệu thật; kiểm tra giao diện local ở kích thước desktop/mobile, không gửi thanh toán/hủy tới hosted.
- [ ] Review độc lập diff, kết quả, lịch sử commit và bảo toàn thay đổi ngoài phạm vi. Báo file thay đổi, commit, bằng chứng, phần chưa kiểm chứng.
- [ ] Dừng để người dùng duyệt. Không push/deploy và không áp SQL hosted. Bước phát hành phải đối chiếu định nghĩa hosted thực tế và dependency nguồn trước, với chấp thuận riêng.
