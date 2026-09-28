# Planner: kiểm tra Supabase chỉ đọc — 28/09/2026

## Phạm vi và phương pháp

- Nhánh khôi phục: `codex/recovery-review`, HEAD khi kiểm tra: `a865315ceed1819573c1495e04eb98deccf8e72f`.
- Dự án được mở trong phiên Chrome đã đăng nhập: `localens-thesis-demo`, project ref `twsdtfotrkljgbfsrmgz`, nhánh Supabase `main / PRODUCTION`.
- Chỉ đọc danh sách Edge Functions, mã đã triển khai và định nghĩa database functions trong Dashboard. Mở định nghĩa bằng màn hình Edit rồi Cancel; không sửa hoặc Save.
- Không gọi hàm tạo/điều chỉnh/gửi yêu cầu, không chạy SQL, migration, seed, deploy hoặc đọc dữ liệu khách hàng.
- Chưa xác minh cấu hình kết nối của từng Vercel deployment trong lượt này. Kết luận phía server dưới đây áp dụng cho đúng project ref trên.

## Bằng chứng trực tiếp

1. Dashboard liệt kê 3 Edge Functions: `recommend-itinerary`, `refine-itinerary`, `research-planner`. `research-planner` hiển thị 15 deployments, cập nhật "2 days ago" tại thời điểm kiểm tra.
2. Mã `research-planner/index.ts` đang triển khai hỗ trợ các action `edit`, `edit_options`, `resume`, `suggest`, `refine`.
3. Mã đang chạy đọc catalog qua `get_research_demo_catalog`, mở phiên bản qua `research_demo_resume` / `research_demo_resume_latest`, lưu qua `research_demo_persist` / `research_demo_persist_edit` và trả `revisionId`, `revisionNumber`.
4. Danh sách database functions xác nhận các hàm trên và `research_demo_submit`, `research_demo_list`, `research_demo_begin_revision`, `research_demo_resubmit` tồn tại. Chỉ kiểm tra sự hiện diện, không thực thi.
5. Định nghĩa `research_demo_submit(p_revision_id uuid)` đọc actor, kiểm tra quyền sở hữu phiên bản, trả lại ID nếu đã gửi, từ chối khi actor có phiên bản tạo sau, tạo request và event `pending_review`. Không có kiểm tra 72 giờ trực tiếp trong thân hàm đã đọc; chưa kiểm tra đầy đủ các hàm phụ/trigger nên chưa kết luận toàn hệ thống có hoặc không có ràng buộc này.
6. Định nghĩa `research_demo_resume_latest` kiểm tra chủ sở hữu rồi tìm phiên bản sâu nhất theo chuỗi `research_demo_revision_links`, trả lại kết quả `research_demo_resume` và `revisionId`.
7. Định nghĩa `research_demo_list(p_admin boolean DEFAULT false)` gọi `private.research_demo_actor(p_admin)` và giới hạn `p_admin OR r.owner_id=actor`; trả request, plan, trạng thái, quotes, history. Không gọi hàm để tải bản ghi.

## Đối chiếu mã nguồn

| Chức năng | Supabase đã kiểm tra | Nhánh recovery-review hiện tại |
| --- | --- | --- |
| Tạo lịch trình và lưu phiên bản | Dịch vụ gọi persist, trả revisionId | Adapter chỉ khai báo hàm tạo; contract chưa có phiên bản |
| Điều chỉnh / gợi ý / mở lại | Action và RPC có trong mã đã deploy | Chưa nối vào ResearchPlannerFlow |
| Xác nhận và gửi | research_demo_submit tồn tại | Chưa có request port trong Supabase shell cho luồng research |
| Danh sách yêu cầu research | research_demo_list(p_admin) | Cần nối đúng contract khi phục hồi |

Không chép nguyên adapter từ worktree `planner-recovery`: `listCustomer` trong bản đó gọi `research_demo_list_customer`, trong khi danh sách public functions kiểm tra tại Dashboard có `research_demo_list`; cần dùng đúng tên và kiểm tra cấu trúc trả về. Adapter planner phục hồi còn kiểm tra mọi phản hồi phải có `status`, nhưng nhánh `edit_options` của dịch vụ đang chạy trả `{request, options, revisionNumber}` không có `status`. Cần xử lý riêng phản hồi này khi nối lại.

## Kết luận và ranh giới xác minh

- Không có bằng chứng backend Planner đã mất. Ngược lại, project kiểm tra vẫn có mã và hàm phục vụ sửa/lưu/gửi; nhánh giao diện đang khôi phục thiếu phần kết nối.
- Chưa cần đề xuất tạo bảng hoặc chạy migration để khôi phục giao diện ở bước này.
- Sự tồn tại của hàm không chứng minh các thao tác thành công end-to-end, quyền thực thi, dữ liệu catalog, CORS, cấu hình Preview hay trạng thái dịch vụ đều đúng.
- Overview từng hiển thị `Unhealthy`; chưa xác định thành phần/nguyên nhân, không quy kết đó là nguyên nhân lỗi Planner.
- Lộ trình đề xuất: nối adapter/contract của nhánh khôi phục với API đã có; giữ nguyên backend, DB, booking, payment, guide; kiểm thử phản hồi thật theo hợp đồng bằng fixture trước; kiểm tra thao tác có ghi dữ liệu trên môi trường/tài khoản thử nghiệm được người dùng đồng ý riêng.

## Nguồn kiểm tra

- https://supabase.com/dashboard/project/twsdtfotrkljgbfsrmgz/functions/research-planner/code
- https://supabase.com/dashboard/project/twsdtfotrkljgbfsrmgz/database/functions
- `lib/infrastructure/supabase/research-planner-adapter.ts` và `lib/application/portal/supabase-shell.ts` ở recovery-review.
- `lib/infrastructure/supabase/research-request-adapter.ts` và `research-planner-adapter.ts` ở planner-recovery (nguồn chỉ đọc).
