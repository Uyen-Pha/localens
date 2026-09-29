# Hủy đơn trong đợt phát hành đồ án

## Quyết định của người dùng

Hủy đơn phải có trong đợt phát hành này. Giữ giao diện đã duyệt, không đổi runtime thật thành mô phỏng, không thêm thanh toán/hoàn tiền thương mại. Branch làm việc: `codex/thesis-release`.

## Xác minh hosted chỉ đọc ngày 29/09/2026

Project `twsdtfotrkljgbfsrmgz`:

- `public.reviewed_demo_cancel(uuid)` đã tồn tại; có kiểm tra chủ đơn, pending chưa hết hạn và confirmed trước khởi hành ít nhất 48 giờ. Đây là bằng chứng định nghĩa SQL, chưa chứng nhận thao tác browser đã thành công.
- `public.research_demo_cancel_booking(uuid,text)` chưa tồn tại. Đây là phần runtime cá nhân hóa còn thiếu.
- `private.research_demo_actor(boolean)` tồn tại, owner `postgres`, SECURITY DEFINER, search_path rỗng; giữ kiểm tra môi trường đồ án, JWT, vai trò và `banned_until`.
- Existing booking/checkout owner `postgres`; cả hai chỉ cấp execute cho `postgres` và `authenticated`. Actor chỉ cấp execute cho `postgres`.
- Operator `postgres` không superuser, có BYPASSRLS và REFERENCES trên `auth.users`, nhưng không có auth USAGE WITH GRANT OPTION. Không yêu cầu thêm quyền Auth cho bản nâng cấp thu gọn.
- Migration cao nhất ghi nhận: `20260926120000`; không tự đánh dấu các migration khác là đã áp.
- Role `localens_cancellation_customer_rpc_owner` đã có, không login/superuser/bypass/inherit/create-role/create-db/replication, không auth USAGE hoặc public/private CREATE. Chỉ `postgres` có membership, SET được phép. Không cần tạo role mới.
- Constraint trạng thái đơn cá nhân hóa hiện chỉ có `pending_payment / confirmed / expired`. Bảng lịch sử hủy chưa tồn tại; không có policy tên `selected_cancel_%` trên bốn bảng liên quan.

MD5 của `pg_proc.prosrc` để đối chiếu drift, không phải bản sao lưu dữ liệu:

| Hàm | MD5 |
|---|---|
| research_demo_actor(boolean) | f741eef8e857b6c6b6ede4b731b9a560 |
| research_demo_booking(uuid,boolean) | dd9cdd374f4fb710b92a7a493f24560d |
| research_demo_checkout(uuid,jsonb) | f1bc48cd8d8facec42d4a0d0500cd139 |

## Gói nâng cấp đang thực hiện

Tái sử dụng nội dung nghiệp vụ trong `20260928230000_research_booking_cancellation.sql`, giữ actor và chủ sở hữu checkout hiện có. Chỉ giới hạn quyền cho RPC Hủy mới; không đưa các thay đổi quyền không liên quan của `020000/030000/040000` vào cùng giao dịch. Không xóa các file migration nguồn hay nới bộ kiểm thử quyền của thiết kế cũ.

Gói được kiểm thử như một bản nâng cấp chọn lọc riêng. Nó không chứng nhận toàn bộ chuỗi migration có thể chạy hosted. Cần đối chiếu lại trước khi chạy chuỗi migration thông thường trong tương lai.

Phần quyền thu gọn chỉ dành cho RPC Hủy cá nhân hóa mới và các phụ thuộc đọc/khóa/ghi lịch sử của nó. Không chuyển owner của actor, booking hoặc checkout đang có; không cấp quyền trực tiếp trên schema/bảng Auth cho owner mới. Các file thử nghiệm riêng nằm trong `supabase/releases/20260929-research-cancellation/` và script selected-local; không ghi chúng vào lịch sử hosted khi chưa áp thành công.

## Bằng chứng local của lượt này

- `node scripts/test-research-cancellation-local.mjs --workdir D:/LocalLensSqlAudit/20260928-research-baseline --test`: exit 0, 123/123 pgTAP; giao dịch test rollback.
- Vitest ba file `research-demo-cancellation`, `research-cancel-booking-dialog`, `research-quote-cancellation`: exit 0, 40/40.
- Agent chính chạy độc lập gói selected-local sau sửa: exit 0; bộ 123 pgTAP đạt ở cả hai trường hợp baseline-shaped upgrade và selected reapply. Banned-customer, giới hạn quyền, từ chối cấu hình lạ, bất biến dữ liệu, chạy lại sau hủy và rollback sau lỗi cưỡng bức đều đạt.
- Lượt độc lập trước đó lỗi phép so sánh thống kê vật lý `pg_class`; chỉ sáu trường bảo trì PostgreSQL được loại khỏi so sánh. Quyền, owner, RLS, cấu trúc và dữ liệu nghiệp vụ vẫn được đối chiếu. Không tắt autovacuum hoặc đổi cấu hình DB.
- SHA256 của migration 2300 được dùng trong lượt kiểm thử: `66bb5359a345b61ef92093f7a372b5913727142b46b78872ace9b076a99fecbc`.
- Các kết quả này xác nhận gói local, chưa xác nhận nâng cấp hosted hoặc thao tác website thật.
- Agent chính chạy lại 12/12 kiểm thử script, scoped ESLint và `git diff --check`: đều đạt. Review độc lập chốt không còn P1/P2 trong phạm vi gói selected SQL.

## Phần phát hành còn lại

- Chưa có bản sao lưu dữ liệu hosted bền vững và kiểm thử khôi phục; bằng chứng catalog chỉ đọc không thay thế bản sao lưu.
- Chưa có artifact SQL hosted cuối được đối chiếu trước/sau và thực thi. Khi áp qua Dashboard, thay đổi quyền phải được xác nhận đúng phạm vi tại thời điểm thực hiện.
- CI toàn nhánh vẫn có các lỗi E2E/runtime cũ đã ghi riêng trong báo cáo preflight; kết quả gói Hủy local không được dùng để tuyên bố toàn bộ CI xanh.
- Chưa chạy nghiệm thu website bằng các đơn QA mới đã được cho phép. Không tuyên bố chức năng đã phát hành chỉ dựa trên commit hoặc bộ pgTAP local.

## Điều kiện trước áp thật

- Gói SQL chính xác phải qua kiểm thử quyền, nâng cấp, bất biến dữ liệu và rollback khi lỗi.
- Lưu preimage của định nghĩa/ACL/constraint bị thay; giải pháp khôi phục phải giữ lịch sử hủy, không khôi phục mù trạng thái đơn cũ.
- Kiểm tra lại owner/fingerprint và quyền hosted ngay trước áp; chạy toàn gói trong một transaction.
- Sau áp: kiểm tra runtime bằng dữ liệu test được phép; không hủy các đơn sẵn có của người dùng để thử.

Người dùng đã cho phép tạo và hủy các đơn kiểm thử riêng sau triển khai, gồm trước/sau thanh toán mô phỏng. Không thu tiền thật, không hủy hoặc sửa bất kỳ đơn hiện có nào của người dùng.

### Nghiệm thu bằng đơn kiểm thử riêng

Ghi lại mã đơn do lượt kiểm thử tạo ra trước mọi thao tác; chỉ thao tác trên danh sách mã đó. Không lấy đơn cũ hoặc chọn ngẫu nhiên một đơn trong tài khoản. Không đổi ngày/giá/trạng thái bằng SQL để ép ca kiểm thử thành công.

| Ca | Kết quả cần xác nhận trên website và dữ liệu |
|---|---|
| Đơn mới chưa thanh toán, còn hiệu lực | Hủy thành công; trạng thái đơn cập nhật, tải lại vẫn đúng; không tạo giao dịch thu tiền |
| Đơn mới đã thanh toán mô phỏng, còn ít nhất 48 giờ đến khởi hành | Hủy thành công; lịch sử hủy được ghi; không mô tả là hoàn tiền thật |
| Hủy lặp lại đơn QA vừa hủy | Không thêm lần hủy trùng, không hồi sinh đơn hoặc tạo thanh toán mới |
| Đơn không còn đủ điều kiện / tài khoản không phải chủ đơn | Giữ kiểm thử phủ định ở local; không dùng đơn cũ của người dùng để kiểm tra |
| QTV xem lịch sử | Chỉ đọc, hiển thị đúng đơn và trạng thái; không sửa lịch sử hủy |

Nếu việc tạo đơn cá nhân hóa cần duyệt/phát hành báo giá bởi QTV, báo rõ bước đó và xin quyền tương ứng; quyền tạo/hủy đơn QA không tự mở rộng thành xử lý yêu cầu hoặc báo giá đang tồn tại.

Chưa áp SQL hosted, chưa merge hoặc deploy trong lượt ghi nhận này.
