# Bàn giao bản nộp LocalLens

## Phạm vi

Website nguyên mẫu phục vụ đồ án, không phải dịch vụ du lịch/thanh toán thương mại. Giữ UI đã duyệt, runtime Supabase ổn định và các phần demo/local state hiện có. Không áp SQL Hủy đơn đang audit, không backfill hoặc sửa dữ liệu đang lưu trong lần phát hành này.

## Liên kết

- Website chính: https://localens-ashen.vercel.app/vi/
- GitHub: https://github.com/Uyen-Pha/localens
- Preview mã sửa: https://localens-keqx45evy-local-lens2.vercel.app/vi/
- Nghiệm thu và giới hạn: [báo cáo kiểm tra](../reports/thesis-post-release-fixes-20260929.md).

## Chạy và kiểm tra

Node.js 24; pnpm 10.17.1. Dùng `corepack.cmd pnpm install --frozen-lockfile`, sau đó `corepack.cmd pnpm dev:demo` để chạy local mẫu. Chế độ kết nối dùng `dev:supabase` và cấu hình công khai được cấp riêng. Không nộp `.env.local`, mật khẩu hay token.

Lệnh kiểm tra: `corepack.cmd pnpm run typecheck`, `corepack.cmd pnpm exec vitest run`, `corepack.cmd pnpm run build:supabase` (cần URL Supabase công khai hợp lệ). Full suite/CI chưa xanh: 9 lỗi SQL baseline; 2 test giao diện đã thất bại trong một lượt song song và đạt khi chạy lại riêng. Không tắt các kiểm tra này để che lỗi.

## Kịch bản trình bày

1. Trang chủ → 6 tour → đúng thông tin tour và lịch khi mở booking.
2. Khách đăng nhập → Planner mô tả tự nhiên hoặc form → kiểm tra thời điểm trước ít nhất 72 giờ → đề xuất/chỉnh lịch. Chỉ gửi yêu cầu khi đã thống nhất dữ liệu test.
3. Đơn đặt tour: cá nhân hóa ở trên, cố định ở dưới; xem trạng thái, chi tiết và thanh toán mô phỏng.
4. QTV: tổng quan → các trang quản lý; giải thích phần thao tác mẫu và phần yêu cầu/báo giá dùng runtime thật.
5. HDV: hồ sơ → lịch/danh sách → chi tiết tour, phân biệt sắp tới/đã khởi hành, không tự suy ra hoàn thành.

Đăng nhập ba vai trò bằng thông tin chủ dự án cung cấp riêng; không ghi mật khẩu trong repo. Không sử dụng đơn hiện có làm đối tượng hủy/thanh toán thử. Chọn ngày demo phù hợp, không sửa ngày dữ liệu cũ để che trạng thái.

## Những gì chưa được chứng nhận

- Không tuyên bố toàn bộ SQL/RLS/pgTAP hoặc CI đạt.
- Preflight Planner 204 chỉ xác nhận domain được phép, không chứng minh mới tạo lịch thành công.
- Nghiệm thu Khách trên Preview là một phần; nghiệm thu đủ thao tác HDV/QTV và sau phát hành cần ghi riêng.
- Không tuyên bố SQL Hủy đơn trong repository đã áp lên hosted Supabase.

## Phát hành và khôi phục

Nguồn phát hành phải là commit `main` đã chốt, không chứa file tạm hay thay đổi worktree khác. Giữ mốc backup của main trước phát hành và commit Preview; lưu ID deployment cũ trong báo cáo phát hành. Nếu Production khác bản đã duyệt, phục hồi deployment cũ; không chạy SQL rollback hoặc sửa dữ liệu. Không xóa các nhánh/worktree recovery sau phát hành.
