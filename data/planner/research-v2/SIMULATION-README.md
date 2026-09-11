# Hồ sơ địa điểm và thông số mô phỏng LocalLens

Người dùng đã đồng ý dùng ước tính nội bộ. Bộ này phục vụ kiểm tra tính khả thi và tạo lịch trình mẫu, không phải giá hoặc khả năng nhận khách chính thức.

Đủ 30 hồ sơ; 26 điểm được chọn trong mô phỏng. Bốn điểm LL-R27–LL-R30 chưa tự động chọn vì chưa xác định hoạt động/cơ sở tiếp khách.

## Thông số cho từng địa điểm

Cột phút và giới hạn khách đều là ước tính. Vé/chi phí ghé thăm và tiền ăn có nguồn khi hồ sơ JSON ghi sourceId; phần còn lại là ước tính, kể cả giá trị 0. Chi phí mua sắm không bắt buộc.

| ID | Địa điểm | Phút | Tối đa khách | Vé/ghé thăm mỗi người | Ăn mỗi người | Dùng mô phỏng |
|---|---|---:|---:|---:|---:|---|
| LL-R01 | Dinh Độc Lập | 90 | 15 | 80.000 | 0 | Có |
| LL-R02 | Bảo tàng Chứng tích Chiến tranh | 90 | 15 | 40.000 | 0 | Có |
| LL-R03 | Bảo tàng Thành phố Hồ Chí Minh | 75 | 15 | 40.000 | 0 | Có |
| LL-R04 | Bảo tàng Lịch sử Thành phố Hồ Chí Minh | 90 | 15 | 30.000 | 0 | Có |
| LL-R05 | Bưu điện Trung tâm Sài Gòn | 30 | 15 | 0 | 0 | Có |
| LL-R06 | Bảo tàng Mỹ thuật Thành phố Hồ Chí Minh | 75 | 15 | 50.000 | 0 | Có |
| LL-R07 | Bảo tàng Phụ nữ Nam Bộ | 60 | 15 | 30.000 | 0 | Có |
| LL-R08 | Bảo tàng Tôn Đức Thắng | 60 | 15 | 30.000 | 0 | Có |
| LL-R09 | Chùa Giác Lâm | 45 | 10 | 0 | 0 | Có |
| LL-R10 | Địa đạo Củ Chi | 180 | 15 | 135.000 | 0 | Có |
| LL-R11 | Chợ Bến Thành | 60 | 10 | 0 | 100.000 | Có |
| LL-R12 | Chợ Tân Định | 60 | 10 | 0 | 80.000 | Có |
| LL-R13 | Chợ An Đông | 60 | 10 | 0 | 0 | Có |
| LL-R14 | Chợ Bình Tây | 75 | 10 | 0 | 0 | Có |
| LL-R15 | Phố ẩm thực Hồ Thị Kỷ | 90 | 8 | 0 | 150.000 | Có |
| LL-R16 | Phố đi bộ Nguyễn Huệ | 45 | 15 | 0 | 0 | Có |
| LL-R17 | Hội quán Tuệ Thành | 45 | 10 | 0 | 0 | Có |
| LL-R18 | Bảo tàng Y học Cổ truyền Việt Nam FITO | 90 | 10 | 180.000 | 0 | Có |
| LL-R19 | Phố Đông y Quận 5 | 45 | 10 | 0 | 0 | Có |
| LL-R20 | Bảo tàng Áo Dài | 90 | 15 | 150.000 | 0 | Có |
| LL-R21 | Chợ Thiếc | 45 | 8 | 0 | 0 | Có |
| LL-R22 | Chợ Phạm Văn Hai | 45 | 10 | 0 | 0 | Có |
| LL-R23 | Chợ Bà Hoa | 60 | 8 | 0 | 100.000 | Có |
| LL-R24 | Hẻm 200 Xóm Chiếu | 75 | 8 | 0 | 140.000 | Có |
| LL-R25 | Bánh mì Hòa Mã | 45 | 6 | 0 | 90.000 | Có |
| LL-R26 | Bánh mì Huỳnh Hoa | 30 | 6 | 0 | 73.000 | Có |
| LL-R27 | Nhà bạc Việt Nam | 75 | 6 | 180.000 | 0 | Chờ cơ sở |
| LL-R28 | Làng nghề Một Thoáng Việt Nam | 120 | 15 | 200.000 | 0 | Chờ cơ sở |
| LL-R29 | Làng bánh tráng Phú Hòa Đông | 90 | 8 | 150.000 | 0 | Chờ cơ sở |
| LL-R30 | Nghề làm lồng đèn Hòa Bình | 75 | 6 | 150.000 | 0 | Chờ cơ sở |

## Cách tính

- Ngân sách nhóm = tổng vé/ghé thăm và ăn theo người × số khách + xe từng chặng + hướng dẫn viên một lần cho cả chuyến.
- Hướng dẫn viên: giả định 200.000 đồng/giờ cho nhóm, tối thiểu 400.000 đồng; tính cả chờ và di chuyển.
- Xe: chọn bậc theo số khách, tính từng chặng; không nhân thêm số khách. Bảng giá nội bộ nằm trong simulation-assumptions.json.
- 930 cạnh có hướng giữa 30 điểm và điểm xuất phát mẫu. Có chặng về; cộng 5 phút đệm và hệ số 1,3 khi xuất phát giờ cao điểm giả định.
- Giờ mở cửa đã đối chiếu được giữ nguyên, gồm ngày nghỉ và nghỉ trưa. Giờ thiếu dùng khung mô phỏng có nhãn riêng.
- Không đáp ứng thời gian/ngân sách thì trả lý do không có tuyến phù hợp, không ép tạo tuyến.
- Không có tọa độ hoặc điểm đón đã xác nhận. Các cạnh mô phỏng không dùng để chỉ đường thực tế.

## Kết quả mẫu đã tính

- Trung tâm: Dinh Độc Lập – Bưu điện: 195 phút, 1.200.000 VND/nhóm.
- Chợ Lớn: Hội quán – Chợ Bình Tây: 235 phút, 1.120.000 VND/nhóm.
- Củ Chi: một điểm, có chặng về: 430 phút, 2.430.000 VND/nhóm.
- Từ chối Củ Chi trong một giờ: không tạo tuyến (insufficient_duration_including_return).
- Từ chối ngân sách quá thấp: không tạo tuyến (insufficient_budget).

## Giới hạn còn giữ

Chưa xác nhận nhận đoàn, số điện thoại còn hiệu lực ở mọi điểm, điều kiện ăn uống, tọa độ hay lịch đóng cửa đặc biệt. Các trường này có trạng thái chưa xác nhận; không được trình bày thành cam kết của đơn vị.

File planner-dataset-v2.json giữ phần nghiên cứu. File planner-simulation-v1.json chứa cấu hình mô phỏng. Bộ tạo tour trên web chưa được nối với bộ dữ liệu mới này.

Tạo lại: node scripts/prepare-planner-dataset-v2.mjs rồi node scripts/build-planner-simulation-dataset.mjs.

## Hồ sơ từng địa điểm

### LL-R01 — Dinh Độc Lập

- Địa chỉ: 135 Nam Kỳ Khởi Nghĩa, phường Bến Thành, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Dinh Độc Lập, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 90 phút; tối đa 15 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 07:00–18:00. Giờ quan sát từ nguồn; vẫn cần kiểm tra đóng cửa đặc biệt trước chuyến thực tế.
- Vé/chi phí ghé thăm: 80.000 VND/người (có nguồn, xem điều kiện đối tượng trong JSON).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Dinh Độc Lập; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: [verified-dinh-2026](https://dinhdoclap.gov.vn/gio-tham-quan-va-gia-ve-moi-nhat-ap-dung-tu-01-8-2025-2/)

### LL-R02 — Bảo tàng Chứng tích Chiến tranh

- Địa chỉ: 28 Võ Văn Tần, phường Xuân Hòa, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Bảo tàng Chứng tích Chiến tranh, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 90 phút; tối đa 15 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 07:30–17:30, nhận khách đến 17:00. Giờ quan sát từ nguồn; vẫn cần kiểm tra đóng cửa đặc biệt trước chuyến thực tế.
- Vé/chi phí ghé thăm: 40.000 VND/người (có nguồn, xem điều kiện đối tượng trong JSON).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Bảo tàng Chứng tích Chiến tranh; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: [verified-war-2026](https://ticket.baotangchungtichchientranh.vn/terms-and-conditions.html)

### LL-R03 — Bảo tàng Thành phố Hồ Chí Minh

- Địa chỉ: 65 Lý Tự Trọng, phường Sài Gòn, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Bảo tàng Thành phố Hồ Chí Minh, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 75 phút; tối đa 15 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 08:00–17:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 40.000 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Bảo tàng Thành phố Hồ Chí Minh; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: 028 3829 9741, nhánh 109; baotangtphcm@gmail.com.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: [city-museum-contact-2026](https://hcmc-museum.edu.vn/luu-tru/4677)

### LL-R04 — Bảo tàng Lịch sử Thành phố Hồ Chí Minh

- Địa chỉ: 2 Nguyễn Bỉnh Khiêm, phường Sài Gòn, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Bảo tàng Lịch sử Thành phố Hồ Chí Minh, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 90 phút; tối đa 15 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 2,3,4,5,6,7 (1=T2, 7=CN), 08:00–11:30; ngày 2,3,4,5,6,7 (1=T2, 7=CN), 13:00–17:00. Giờ quan sát từ nguồn; vẫn cần kiểm tra đóng cửa đặc biệt trước chuyến thực tế.
- Vé/chi phí ghé thăm: 30.000 VND/người (có nguồn, xem điều kiện đối tượng trong JSON).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Bảo tàng Lịch sử Thành phố Hồ Chí Minh; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: [verified-history-2026](https://www.baotanglichsutphcm.com.vn/tham-quan/chinh-sach)

### LL-R05 — Bưu điện Trung tâm Sài Gòn

- Địa chỉ: 2 Công xã Paris, phường Sài Gòn, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Bưu điện Trung tâm Sài Gòn, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 30 phút; tối đa 15 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 08:00–17:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Bưu điện Trung tâm Sài Gòn; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R06 — Bảo tàng Mỹ thuật Thành phố Hồ Chí Minh

- Địa chỉ: 97 Phó Đức Chính, phường Bến Thành, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Bảo tàng Mỹ thuật Thành phố Hồ Chí Minh, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 75 phút; tối đa 15 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 08:00–17:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 50.000 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Bảo tàng Mỹ thuật Thành phố Hồ Chí Minh; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: [research-finearts-2026](https://www.baotangmythuattphcm.com.vn/tham-quan)

### LL-R07 — Bảo tàng Phụ nữ Nam Bộ

- Địa chỉ: 200–202 Võ Thị Sáu, phường Xuân Hòa, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Bảo tàng Phụ nữ Nam Bộ, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 60 phút; tối đa 15 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 07:30–11:30; ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 13:30–17:00. Giờ sáng/chiều có nguồn; ngày hoạt động giả định cho mô phỏng.
- Vé/chi phí ghé thăm: 30.000 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Bảo tàng Phụ nữ Nam Bộ; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; bt.pnnb.svhtt@tphcm.gov.vn.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: [women-museum-2026](https://baotangphunu.com/)

### LL-R08 — Bảo tàng Tôn Đức Thắng

- Địa chỉ: 5 Tôn Đức Thắng, phường Sài Gòn, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Bảo tàng Tôn Đức Thắng, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 60 phút; tối đa 15 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 2,3,4,5,6,7 (1=T2, 7=CN), 07:30–11:30; ngày 2,3,4,5,6,7 (1=T2, 7=CN), 13:00–17:00. Giờ quan sát từ nguồn; vẫn cần kiểm tra đóng cửa đặc biệt trước chuyến thực tế.
- Vé/chi phí ghé thăm: 30.000 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Bảo tàng Tôn Đức Thắng; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: [verified-tonducthang-2026](https://baotangtonducthang.vn/)

### LL-R09 — Chùa Giác Lâm

- Địa chỉ: 565 Lạc Long Quân, phường Bảy Hiền, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Chùa Giác Lâm, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 45 phút; tối đa 10 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 08:00–17:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Chùa Giác Lâm; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R10 — Địa đạo Củ Chi

- Địa chỉ: Khu Bến Dược, ấp Phú Hiệp, xã An Nhơn Tây, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Địa đạo Củ Chi, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 180 phút; tối đa 15 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 08:00–16:30. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 135.000 VND/người (có nguồn, xem điều kiện đối tượng trong JSON).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Địa đạo Củ Chi; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: [cuchi-fee-2026](https://diadaocuchi.com.vn/thong-bao-tang-gia-ve-phuc-vu-huong-dan-399.html)

### LL-R11 — Chợ Bến Thành

- Địa chỉ: Chợ Bến Thành, phía Công trường Quách Thị Trang, phường Bến Thành, TP. Hồ Chí Minh.
- Hoạt động: Ghé Chợ Bến Thành, dành thời gian ăn uống và khám phá khu vực. Món ăn cụ thể cần phù hợp yêu cầu của khách.
- Thời lượng mô phỏng: 60 phút; tối đa 10 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 09:00–17:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 100.000 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Chợ Bến Thành; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện; Chốt món ăn, dị ứng và khả năng phục vụ nhóm.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R12 — Chợ Tân Định

- Địa chỉ: 314–336 Hai Bà Trưng, phường Tân Định, TP. Hồ Chí Minh.
- Hoạt động: Ghé Chợ Tân Định, dành thời gian ăn uống và khám phá khu vực. Món ăn cụ thể cần phù hợp yêu cầu của khách.
- Thời lượng mô phỏng: 60 phút; tối đa 10 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 09:00–17:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 80.000 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Chợ Tân Định; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện; Chốt món ăn, dị ứng và khả năng phục vụ nhóm.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R13 — Chợ An Đông

- Địa chỉ: 34–36 An Dương Vương, phường An Đông, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Chợ An Đông, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 60 phút; tối đa 10 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 09:00–16:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Chợ An Đông; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R14 — Chợ Bình Tây

- Địa chỉ: 57A Tháp Mười, phường Bình Tây, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Chợ Bình Tây, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 75 phút; tối đa 10 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 09:00–16:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Chợ Bình Tây; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R15 — Phố ẩm thực Hồ Thị Kỷ

- Địa chỉ: Đường Hồ Thị Kỷ, phường Vườn Lài, TP. Hồ Chí Minh.
- Hoạt động: Ghé Phố ẩm thực Hồ Thị Kỷ, dành thời gian ăn uống và khám phá khu vực. Món ăn cụ thể cần phù hợp yêu cầu của khách.
- Thời lượng mô phỏng: 90 phút; tối đa 8 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 16:00–21:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 150.000 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Phố ẩm thực Hồ Thị Kỷ; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện; Chốt món ăn, dị ứng và khả năng phục vụ nhóm.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R16 — Phố đi bộ Nguyễn Huệ

- Địa chỉ: Đường Nguyễn Huệ, đoạn Lê Lợi – Tôn Đức Thắng, phường Sài Gòn, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Phố đi bộ Nguyễn Huệ, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 45 phút; tối đa 15 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 08:00–21:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Phố đi bộ Nguyễn Huệ; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R17 — Hội quán Tuệ Thành

- Địa chỉ: 710 Nguyễn Trãi, phường Chợ Lớn, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Hội quán Tuệ Thành, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 45 phút; tối đa 10 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 08:00–16:30. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Hội quán Tuệ Thành; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R18 — Bảo tàng Y học Cổ truyền Việt Nam FITO

- Địa chỉ: 41 Hoàng Dư Khương, phường Hòa Hưng, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Bảo tàng Y học Cổ truyền Việt Nam FITO, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 90 phút; tối đa 10 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 09:00–16:30. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 180.000 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Bảo tàng Y học Cổ truyền Việt Nam FITO; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: [fito-government-2022](https://svhtt.hochiminhcity.gov.vn/documents/10184/354475/to%2Bgap%2B10%2Bbao%2Btang%2Bhoan%2Bthien%2B%28ng%C3%A0y%2B21.11.2022%29.pdf/cd343255-8c41-4250-bd9a-92c203837de8)

### LL-R19 — Phố Đông y Quận 5

- Địa chỉ: Cụm phố Đông y Hải Thượng Lãn Ông – Lương Nhữ Học – Triệu Quang Phục, phường Chợ Lớn, TP. Hồ Chí Minh.
- Hoạt động: Dạo quanh khu vực Phố Đông y Quận 5, tìm hiểu sinh hoạt và ngành nghề địa phương; mua sắm tùy nhu cầu.
- Thời lượng mô phỏng: 45 phút; tối đa 10 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 09:00–16:30. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Phố Đông y Quận 5; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R20 — Bảo tàng Áo Dài

- Địa chỉ: 206/19/30 Long Thuận, phường Long Phước, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Bảo tàng Áo Dài, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 90 phút; tối đa 15 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 09:00–16:30. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 150.000 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Bảo tàng Áo Dài; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R21 — Chợ Thiếc

- Địa chỉ: 129 Phó Cơ Điều, phường Minh Phụng, TP. Hồ Chí Minh.
- Hoạt động: Dạo quanh khu vực Chợ Thiếc, tìm hiểu sinh hoạt và ngành nghề địa phương; mua sắm tùy nhu cầu.
- Thời lượng mô phỏng: 45 phút; tối đa 8 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 09:00–16:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Chợ Thiếc; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R22 — Chợ Phạm Văn Hai

- Địa chỉ: 128 Phạm Văn Hai, phường Tân Sơn Hòa, TP. Hồ Chí Minh.
- Hoạt động: Tham quan Chợ Phạm Văn Hai, tìm hiểu không gian và câu chuyện của địa điểm.
- Thời lượng mô phỏng: 45 phút; tối đa 10 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 09:00–16:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Chợ Phạm Văn Hai; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R23 — Chợ Bà Hoa

- Địa chỉ: 99 Trần Mai Ninh, phường Bảy Hiền, TP. Hồ Chí Minh.
- Hoạt động: Ghé Chợ Bà Hoa, dành thời gian ăn uống và khám phá khu vực. Món ăn cụ thể cần phù hợp yêu cầu của khách.
- Thời lượng mô phỏng: 60 phút; tối đa 8 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 09:00–17:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 100.000 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Chợ Bà Hoa; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện; Chốt món ăn, dị ứng và khả năng phục vụ nhóm.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R24 — Hẻm 200 Xóm Chiếu

- Địa chỉ: Hẻm 200 đường Xóm Chiếu, phường Xóm Chiếu, TP. Hồ Chí Minh.
- Hoạt động: Ghé Hẻm 200 Xóm Chiếu, dành thời gian ăn uống và khám phá khu vực. Món ăn cụ thể cần phù hợp yêu cầu của khách.
- Thời lượng mô phỏng: 75 phút; tối đa 8 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 16:00–21:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 140.000 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Hẻm 200 Xóm Chiếu; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện; Chốt món ăn, dị ứng và khả năng phục vụ nhóm.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R25 — Bánh mì Hòa Mã

- Địa chỉ: 53 Cao Thắng, phường Bàn Cờ, TP. Hồ Chí Minh.
- Hoạt động: Ghé Bánh mì Hòa Mã, dành thời gian ăn uống và khám phá khu vực. Món ăn cụ thể cần phù hợp yêu cầu của khách.
- Thời lượng mô phỏng: 45 phút; tối đa 6 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 07:00–10:30. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 90.000 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Bánh mì Hòa Mã; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện; Chốt món ăn, dị ứng và khả năng phục vụ nhóm.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R26 — Bánh mì Huỳnh Hoa

- Địa chỉ: 26–30–32 Lê Thị Riêng, phường Bến Thành, TP. Hồ Chí Minh.
- Hoạt động: Ghé Bánh mì Huỳnh Hoa, dành thời gian ăn uống và khám phá khu vực. Món ăn cụ thể cần phù hợp yêu cầu của khách.
- Thời lượng mô phỏng: 30 phút; tối đa 6 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 06:00–22:00. Giờ quan sát từ nguồn; vẫn cần kiểm tra đóng cửa đặc biệt trước chuyến thực tế.
- Vé/chi phí ghé thăm: 0 VND/người (ước tính nội bộ).
- Ăn uống: 73.000 VND/người (giá món từ nguồn).
- Điểm gặp: Dự kiến tập trung tại lối vào Bánh mì Huỳnh Hoa; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện; Chốt món ăn, dị ứng và khả năng phục vụ nhóm.
- Nguồn đối chiếu: [huynhhoa-2026](https://banhmihuynhhoa.vn/review-banh-mi-huynh-hoa-gia-bao-nhieu/)

### LL-R27 — Nhà bạc Việt Nam

- Địa chỉ: 68 Nghĩa Thục, phường An Đông, TP. Hồ Chí Minh.
- Hoạt động: Hồ sơ tham khảo về Nhà bạc Việt Nam; chưa lên lịch hoạt động với cơ sở.
- Thời lượng mô phỏng: 75 phút; tối đa 6 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 09:00–16:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 180.000 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Nhà bạc Việt Nam; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện; Xác định cơ sở tiếp khách và đặt lịch hoạt động.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R28 — Làng nghề Một Thoáng Việt Nam

- Địa chỉ: 109 Nguyễn Thị Sửa, ấp Phú Bình, xã An Nhơn Tây, TP. Hồ Chí Minh.
- Hoạt động: Hồ sơ tham khảo về Làng nghề Một Thoáng Việt Nam; chưa lên lịch hoạt động với cơ sở.
- Thời lượng mô phỏng: 120 phút; tối đa 15 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 09:00–16:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 200.000 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Làng nghề Một Thoáng Việt Nam; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện; Xác định cơ sở tiếp khách và đặt lịch hoạt động.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R29 — Làng bánh tráng Phú Hòa Đông

- Địa chỉ: Khu vực làng nghề bánh tráng Phú Hòa Đông, xã Phú Hòa Đông, TP. Hồ Chí Minh.
- Hoạt động: Hồ sơ tham khảo về Làng bánh tráng Phú Hòa Đông; chưa lên lịch hoạt động với cơ sở.
- Thời lượng mô phỏng: 90 phút; tối đa 8 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 09:00–16:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 150.000 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Làng bánh tráng Phú Hòa Đông; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện; Xác định cơ sở tiếp khách và đặt lịch hoạt động.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.

### LL-R30 — Nghề làm lồng đèn Hòa Bình

- Địa chỉ: Khu làng lồng đèn Phú Bình, phường Hòa Bình, TP. Hồ Chí Minh.
- Hoạt động: Hồ sơ tham khảo về Nghề làm lồng đèn Hòa Bình; chưa lên lịch hoạt động với cơ sở.
- Thời lượng mô phỏng: 75 phút; tối đa 6 khách (giới hạn nội bộ, chưa phải sức chứa đơn vị xác nhận).
- Khung giờ: ngày 1,2,3,4,5,6,7 (1=T2, 7=CN), 09:00–16:00. Khung ghé thăm giả định phục vụ mô phỏng, không phải giờ mở cửa chính thức.
- Vé/chi phí ghé thăm: 150.000 VND/người (ước tính nội bộ).
- Ăn uống: 0 VND/người (ước tính nội bộ; 0 nghĩa là chưa bố trí bữa ăn).
- Điểm gặp: Dự kiến tập trung tại lối vào Nghề làm lồng đèn Hòa Bình; cần chốt vị trí cụ thể trước chuyến thực tế.
- Liên hệ: chưa xác nhận điện thoại; chưa xác nhận email.
- Trước chuyến thực tế: Xác nhận lịch hoạt động vào ngày đi; Chốt điểm gặp và phương tiện; Xác định cơ sở tiếp khách và đặt lịch hoạt động.
- Nguồn đối chiếu: Chỉ có nghiên cứu nguồn ban đầu; chưa bổ sung nguồn mới đủ tin cậy.
