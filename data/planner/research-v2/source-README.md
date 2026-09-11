# LocalLens – dữ liệu đề xuất cho bộ tạo tour cá nhân hóa

Bộ này ánh xạ 30 địa điểm nghiên cứu vào 5 lựa chọn khu vực trên giao diện hiện tại và 4 nhóm trải nghiệm. **Không tự động coi dữ liệu là đã được QTV xác nhận.**

## 1. Coverage theo khu vực

| Khu vực | Điểm core | Ẩm thực | Lịch sử | Làng nghề | Chợ/đời sống | Thời lượng tối thiểu đề xuất |
|---|---:|---:|---:|---:|---:|---:|
| Trung tâm Sài Gòn | 9 | 2 | 7 | 0 | 1 | 2 giờ |
| Tân Định – Bàn Cờ | 5 | 2 | 3 | 0 | 1 | 2 giờ |
| Chợ Lớn – Bình Tây | 7 | 1 | 2 | 3 | 4 | 3 giờ |
| Bảy Hiền – Tân Bình | 3 | 2 | 1 | 0 | 2 | 3 giờ |
| Củ Chi | 3 | 1 | 1 | 2 | 0 | 6 giờ |

**Quan trọng:** Mức độ ưu tiên trải nghiệm là trọng số mềm. Ví dụ, khách chọn Trung tâm Sài Gòn + Làng nghề = Ưu tiên cao thì hệ thống vẫn trả lịch trình trung tâm tốt nhất, nhưng phải nói rõ khu vực này chưa có điểm làng nghề đã xác nhận; không tự bịa thêm điểm.

## 2. Luồng đúng với Use Case

1. Hệ thống nhận thời gian, ngân sách, khu vực, số người, mức ưu tiên trải nghiệm và nhu cầu bổ sung.
2. Trước khi gọi AI, hệ thống chỉ lấy các địa điểm `published + admin_verified + planner_eligible` và đáp ứng ràng buộc cứng.
3. Hệ thống gửi **danh sách ứng viên có ID cố định** sang AI và hiển thị trạng thái đang xử lý.
4. AI chỉ xếp hạng/sắp xếp các `placeId` đã nhận, không được tạo tên địa điểm, giá, giờ hoạt động hoặc thời gian di chuyển mới.
5. Hệ thống nhận thứ tự từ AI rồi kiểm tra lại tổng thời gian, chi phí dự kiến, giờ hoạt động và khả năng di chuyển.
6. Nếu một điểm làm lịch trình sai ràng buộc, hệ thống bỏ điểm xếp hạng thấp nhất gây xung đột và kiểm tra lại. Nếu vẫn thiếu điểm, dùng `nearby_fallback` với thông báo rõ cho khách.

## 3. Quy tắc để mọi lựa chọn trên UI đều có phản hồi

- Khu vực là **vùng ưu tiên**, không phải bắt buộc phải ghé tất cả khu vực được chọn.
- Trải nghiệm là **mức ưu tiên**, không phải bộ lọc loại trừ. Vì vậy khu vực không có làng nghề vẫn có thể tạo lịch trình best-fit thay vì trả rỗng.
- Củ Chi cần tối thiểu khoảng **6 giờ** trong prototype. Nếu khách chọn ít hơn, UI nên chặn/nhắc tăng thời lượng; không tạo lịch trình giả.
- Nếu chưa có điểm bắt đầu/điểm đón, hệ thống chỉ kiểm tra thời gian di chuyển giữa các điểm; muốn kiểm tra đầy đủ Củ Chi phải bổ sung điểm đón hoặc điểm xuất phát mặc định.

## 4. Ánh xạ khu vực hiện tại

### Trung tâm Sài Gòn

- Dinh Độc Lập (LL-R01)
- Bảo tàng Thành phố Hồ Chí Minh (LL-R03)
- Bảo tàng Lịch sử Thành phố Hồ Chí Minh (LL-R04)
- Bưu điện Trung tâm Sài Gòn (LL-R05)
- Bảo tàng Mỹ thuật Thành phố Hồ Chí Minh (LL-R06)
- Bảo tàng Tôn Đức Thắng (LL-R08)
- Chợ Bến Thành (LL-R11)
- Phố đi bộ Nguyễn Huệ (LL-R16)
- Bánh mì Huỳnh Hoa (LL-R26)
- **Fallback lân cận:** Hẻm 200 Xóm Chiếu

### Tân Định – Bàn Cờ

- Bảo tàng Chứng tích Chiến tranh (LL-R02)
- Bảo tàng Phụ nữ Nam Bộ (LL-R07)
- Chợ Tân Định (LL-R12)
- Bảo tàng Y học Cổ truyền Việt Nam FITO (LL-R18)
- Bánh mì Hòa Mã (LL-R25)
- **Fallback lân cận:** Phố ẩm thực Hồ Thị Kỷ

### Chợ Lớn – Bình Tây

- Chợ An Đông (LL-R13)
- Chợ Bình Tây (LL-R14)
- Hội quán Tuệ Thành (LL-R17)
- Phố Đông y Quận 5 (LL-R19)
- Chợ Thiếc (LL-R21)
- Nhà bạc Việt Nam (LL-R27)
- Nghề làm lồng đèn Hòa Bình (LL-R30)

### Bảy Hiền – Tân Bình

- Chùa Giác Lâm (LL-R09)
- Chợ Phạm Văn Hai (LL-R22)
- Chợ Bà Hoa (LL-R23)
- **Fallback lân cận:** Bảo tàng Y học Cổ truyền Việt Nam FITO

### Củ Chi

- Địa đạo Củ Chi (LL-R10)
- Làng nghề Một Thoáng Việt Nam (LL-R28)
- Làng bánh tráng Phú Hòa Đông (LL-R29)

## 5. Gợi ý hợp đồng dữ liệu AI

AI nên trả JSON dạng tối giản: `[{placeId, rank, reason}]`. Hệ thống là bên duy nhất tính lịch giờ, chi phí và kiểm tra hợp lệ sau đó. Điều này giữ đúng nguyên tắc LocalLens: AI hỗ trợ đề xuất, không quyết định nghiệp vụ.
