# Planner A — mốc phục hồi phần nhập liệu

## Phạm vi đã chọn

Người dùng chọn A: mặc định nhập mô tả tự nhiên, có thể chuyển sang form chi tiết gọn. Đây là mốc phục hồi **phần nhập liệu**, chưa phải nghiệm thu toàn bộ Planner hoặc LocalLens.

Nhánh làm việc: `codex/recovery-review`, nền trước thay đổi: `8260629`.

## Thay đổi

- `components/customer/planner-surface.tsx`: giữ phần nhập liệu khi đổi chế độ/quay lại từ kết quả; form chi tiết được tạo khi dùng lần đầu; giữ nguyên lựa chọn demo/Supabase và các cổng xử lý đang có.
- `components/customer/personalization-form.tsx`: thêm biến thể form gọn riêng cho Planner, chọn sở thích bằng nút, thu gọn khu vực/nâng cao, nhập giờ theo định dạng 24 giờ. Tự mở khu vực khi gửi form mà chưa chọn khu vực.
- `components/customer/planner-recovery.module.css`: giới hạn chiều rộng, sắp xếp form và tóm tắt, hiển thị một cột ở màn hình nhỏ; không áp dụng toàn cục cho các phân hệ khác.
- `components/customer/itinerary-preview.tsx`: không hiển thị khung kết quả trống trước khi có hành trình/lỗi.
- `tests/components/customer/planner-surface.test.tsx`: bổ sung kiểm tra giữ mô tả, giữ số khách, chọn sở thích, chuyển dữ liệu đúng đơn vị và quay lại từ kết quả.

Không thay schema, migration, dữ liệu, bộ phân tích câu, thuật toán lập lịch, đặt tour, thanh toán, phân công HDV hay commit lịch HDV đang có.

## Khác biệt so với ảnh tham chiếu được giữ có chủ đích

Để không thay nghiệp vụ của bản nền khi phục hồi giao diện:

- Ngân sách trong form hiện là **ngân sách cả nhóm**, không tự chuyển sang ngân sách mỗi khách.
- Khu vực vẫn bắt buộc chọn ít nhất một theo kiểm tra hiện tại.
- Nhịp độ vẫn là hai giá trị đang được runtime hỗ trợ; không tự thêm giá trị “Cân bằng”.

## Đối chiếu các bước

| Bước | Bằng chứng | Giới hạn |
| --- | --- | --- |
| Mặc định nhập câu mô tả | Test component và trình duyệt | Bộ phân tích hiện tại, không tuyên bố AI production |
| Đổi sang form gọn và quay lại | Test giữ nguyên câu và số khách, kiểm tra trên trình duyệt | Không đảm bảo giữ bản nháp chưa lưu sau khi đóng tab/tải lại |
| Phân tích mô tả | Trình duyệt nhận đúng ngày 10/10/2026, 09:00, 4 giờ, 2 người, 2 triệu/nhóm | Kiểm tra cục bộ |
| Tạo hành trình và quay lại | Demo tạo hành trình; câu mô tả vẫn còn | Không thay thế nghiệm thu Supabase |
| Form gửi dữ liệu sang luồng runtime | Test lưu 4 khách, ngân sách nhóm 1.000.000 VND, giờ 14:00 UTC+7 | Dùng cổng kiểm thử, không gửi yêu cầu thật |
| Điều chỉnh/xác nhận/gửi yêu cầu | Luồng demo có yêu cầu danh tính khách hàng; research runtime vẫn thiếu phần nối đã ghi nhận | Chưa phục hồi/kiểm tra đầu-cuối trong mốc này |

## Kiểm tra

- Kiểm thử tập trung cuối: 18/18 đạt, gồm 4 file; bao gồm hồi quy thứ tự bàn phím.
- Typecheck, lint toàn dự án và build demo (`--webpack`) đạt. Lần typecheck cuối đã sửa tùy chọn selector không hợp lệ trong test bổ sung.
- Trình duyệt: kiểm tra bản dev và bản build tĩnh. Không có lỗi console được ghi nhận ở bản build.
- Màn hình nhỏ: viewport 390px, chiều rộng nội dung/khung tài liệu 375/375 sau khi trừ thanh cuộn; cả hai chế độ không tràn ngang. Bản build form cũng đạt kiểm tra này.
- Bộ test form cũ: 19 lỗi, 10 đạt tại nhánh nền sạch `ui-runtime-recovery` (`b902531`); nhánh sửa gặp cùng 19 lỗi. Không đổi các test cũ chỉ để làm xanh báo cáo.
- Bộ test toàn dự án: 2.157 đạt, 81 lỗi trên tổng 2.238 kiểm thử. Danh sách đầy đủ: `2026-09-28-planner-A-test-failures.md`. Lần chạy này trước chỉnh thứ tự Tab cuối cùng; các kiểm thử tập trung đã được chạy lại sau sửa. Những lỗi ngoài nhóm 19 lỗi form chưa được xác định nguồn gốc ở mốc này.
- Rà soát độc lập phát hiện thứ tự nhìn và thứ tự Tab lệch nhau, cùng cột AM/PM trống. Đã sửa bằng thứ tự JSX thực tế và lưới giờ/phút 3 cột; không dùng CSS order để đổi thứ tự ô nhập trong form gọn.

## Xem thử và giới hạn phát hành

Bản build thử cục bộ: http://127.0.0.1:3301/vi/planner/ — chạy trên máy này, dùng demo, không phải Vercel Preview hoặc production.

Ảnh và báo cáo kiểm thử được lưu tại `C:/Users/Admin/Documents/Project/output/recovery-audit-20260928/`, gồm `planner-A-built-form.png`, `planner-A-built-natural.png`, `planner-A-built-form-mobile.png`, `planner-A-focused.json`, `planner-A-baseline-personalization.json`.

Chưa merge main, chưa push bản này, chưa deploy, chưa chạy migration hay gửi dữ liệu khách lên backend thật. Các cổng khách, QTV, HDV còn lại chưa được nghiệm thu lại ở mốc này.

## Bước tiếp theo đề xuất

Khôi phục màn hình hành trình, điều chỉnh và xác nhận/gửi yêu cầu sau khi đối chiếu nguồn với cổng xử lý hiện tại. Những phần cần bổ sung backend phải được tách khỏi thay đổi giao diện và không giả lập nút thành công.
