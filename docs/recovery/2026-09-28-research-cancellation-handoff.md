# Bàn giao Hủy đơn cá nhân hóa — phạm vi local

## Phạm vi đã thực hiện

Triển khai theo kế hoạch đã duyệt, dùng Superpowers để điều phối PM, Dev và QC độc lập. Chỉ sửa luồng research mà website đang dùng; không chuyển sang public.bookings, không sửa giao diện đã duyệt, không thêm hoàn tiền tự động.

- SQL Hủy kiểm tra khách sở hữu, trạng thái đơn, hạn thanh toán hoặc mốc ít nhất48 giờ theo revision gắn với đơn. Máy chủ kiểm tra lại sau khi lấy khóa.
- Hủy và lịch sử được ghi nguyên tử; gửi lặp không tạo lịch sử trùng. Đơn đã trả tiền vẫn giữ thông tin thanh toán và số tiền.
- Hai adapter và hai màn hình được nối với đúng RPC research. Có xác nhận, quay lại, chặn bấm lặp, giữ khóa thử lại và đọc lại trạng thái máy chủ.
- QC phát hiện và Dev sửa lỗi mất thông tin khách khi mở Hủy rồi Quay lại; dữ liệu form và lựa chọn thanh toán được giữ.
- Migration có transaction riêng; công cụ test giữ quyền hoàn tác đến sau khi đối chiếu dữ liệu. Không có backfill dữ liệu nghiệp vụ.

## Bằng chứng đã xác minh

| Kiểm tra | Kết quả / giới hạn |
|---|---|
| Nâng cấp và chạy lại SQL | Hai lần đều giữ nguyên dữ liệu cũ và RPC ngoài phạm vi |
| pgTAP research |123/123 đạt, giao dịch kiểm thử được rollback |
| Hai kết nối đồng thời |7/7 đạt; gọi RPC thanh toán/hủy thật trên local |
| Hoàn tác migration |2/2 đạt khi cố ý gây lỗi DDL và lỗi đối chiếu sau nâng cấp |
| Typecheck | Đạt sau bản sửa cuối |
| Test tập trung bản cuối | 147/147 đạt trên 10 file |
| Toàn bộ test JavaScript trên code ổn định | 2523/2543 đạt; 20 lỗi ở 10 file ngoài nhóm test tính năng. Các lỗi inventory/quyền có đóng góp mới từ SQL research, không gọi toàn bộ là baseline |
| Lint file chức năng | Đạt |
| Build Supabase mode | Đạt,43 trang; URL local và khóa chỉ dùng build, không kết nối dữ liệu thật |
| Giao diện component |1280px/390px không tràn ngang, Quay lại/Xác nhận hoạt động; dùng port mẫu trong công cụ QA riêng |
| Bộ database cũ riêng |1788/1793 đạt; còn5 lỗi identity/RLS đã được ghi riêng |
| Toàn bộ route sau đăng nhập | Chưa xác minh; công cụ chặn khởi động máy chủ Next local. Component QA không thay thế kiểm tra ba vai trò |

Không cộng số test các lượt chạy chồng lắp để tạo tổng thành tích. Lượt toàn repo cuối chạy trên `edbdcf6`, lưu tại `.superpowers/sdd/2026-09-28-research-booking-cancellation/stable-vitest.json`. Các nhóm còn lỗi: tours (2), read-only API (1), import boundary (1), area adapter (1), demo planner (2), personalization areas (1), styles (3), SQL artifacts (3), RLS matrix (3), cloud seed (3). Không refactor các phần ngoài phạm vi chỉ để làm xanh toàn repo.

## Checkpoint code

- `7ddf7cf`: dựng baseline research đúng nguồn, lưu hash và dữ liệu cũ để kiểm tra nâng cấp.
- `81857c3`: SQL Hủy và kiểm thử hành vi/đồng thời.
- `5287e8e`: adapter và giao diện Hủy.
- `e158bf5`: giữ thông tin khách qua Hủy → Quay lại.
- `edbdcf6`: đóng gói migration nguyên tử, timeout và ghi rõ các điểm chặn phát hành.

Nhánh: `recovery/unified-preview`. Đây là commit local, chưa push. Những thay đổi recovery có sẵn ngoài phạm vi vẫn được giữ, không gom vào commit chức năng này.

## Chưa đủ điều kiện merge/deploy

1. Baseline research hiện mới có trong fixture kiểm thử, chưa có đầy đủ trong chuỗi migration phát hành. Không thể dựng release mới chỉ bằng các migrations hiện tại.
2. Danh mục bảo mật chưa đăng ký đầy đủ bảng lịch sử, helper, RPC và quyền mới; chính sách owner cần được đối chiếu riêng. Đây là đóng góp lỗi mới, không được gộp hết vào lỗi baseline.
3. Chưa đối chiếu định nghĩa SQL/quyền đang chạy trên Supabase thật, chưa xác nhận toàn bộ luồng ba vai trò trên Preview.
4. Baseline kiểm thử chưa bao gồm migration deadline/list mới hơn; không dùng kết quả này để khẳng định các phần đó đã được kiểm chứng.

Chi tiết SQL, grant, owner và các lỗi kiểm tra tĩnh: xem `2026-09-28-cancellation-local-impact.md` cùng thư mục.

## Các quyết định điều phối

| Quyết định | Lý do | Đánh đổi |
|---|---|---|
| Chỉ Main chạy Docker/SQL | Tránh team thao tác chồng lên database | Phản hồi SQL chậm hơn |
| Ghi riêng lỗi baseline, không refactor toàn repo | Giữ phạm vi và giao diện đã duyệt | Các lỗi cũ vẫn cần xử lý trước phát hành |
| Test research nằm ngoài gate database mặc định | Gate cũ chưa có baseline research | CI cần được nối lại khi baseline được duyệt |
| Review cuối giới hạn feature hiện tại | Không chứng nhận thay mọi phần recovery cũ | Bản recovery tổng vẫn cần audit phát hành riêng |
| Sửa atomicity/timeout, ghi rõ thiếu inventory/owner | Không tự dựng thêm kiến trúc quyền hoặc baseline chưa được duyệt | Chưa được merge/deploy |

## Bảo toàn dữ liệu và bước tiếp theo

Không áp `20260928100000_booking_cancellation_rules.sql` hoặc SQL research mới lên Supabase thật. Không sửa/backfill đơn thật. Không merge main, không push, không deploy. Không xóa/reset các nhánh hay worktree recovery. Các container cũ được giữ; máy chủ component QA tạm do Main tạo đã dừng.

Bước tiếp theo cần duyệt riêng: đối chiếu nguồn SQL/runtime hiện có với Supabase và hoàn thiện gói phát hành/manifest, rồi kiểm tra Preview có đăng nhập. Không suy diễn phê duyệt local thành quyền chạy migration thật. Rollback Git/Vercel không hoàn tác database; không xóa lịch sử hủy hay khôi phục trạng thái đơn một cách tự động.
