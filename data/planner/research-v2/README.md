# LocalLens — Bộ địa điểm cá nhân hóa v2

Ngày đối chiếu: 2026-09-11. Giữ đủ 30 địa điểm và ID nguồn.

Ưu tiên nội thành: 23; chờ điều kiện tiếp khách: 6; ngoài vùng hiện tại: 1.

## Những gì đã sửa

- Tách giá vé quan sát được từ nguồn chính thức khỏi khoảng chi tiêu ước tính ban đầu. Giá chưa rõ để null, không thay bằng 0.
- Bổ sung nguồn, ngày đối chiếu, giờ nghỉ trưa và điều kiện vé. Giữ nguyên nghiên cứu gốc trong mỗi bản ghi.
- Tách chi phí theo người và theo nhóm; không tự cộng mua sắm vào ngân sách bắt buộc.
- Ngừng dùng thời gian trung bình giữa khu vực để khẳng định một tuyến khả thi. Chưa có cạnh di chuyển được duyệt.
- Không biến tham quan khu làng nghề thành một buổi thực hành có thể đặt chỗ.
- Dữ liệu nghiên cứu không tự bật published/adminVerified/plannerEligible.

## Đã đối chiếu trực tiếp

- Dinh Độc Lập: 07:00–18:00; vé toàn bộ 80.000 VND cho tuổi 18–59, không phải mọi nhóm tuổi hay mọi loại vé.
- Bảo tàng Chứng tích Chiến tranh: vé người lớn quốc tế 40.000 VND; 07:30–17:30, nhận khách đến 17:00.
- Bảo tàng Lịch sử: vé phổ thông 30.000 VND; thứ Ba–Chủ nhật, 08:00–11:30 và 13:00–17:00.
- Bảo tàng Tôn Đức Thắng: đối chiếu được giờ thứ Ba–Chủ nhật, chưa dùng thông tin miễn phí cũ làm xác nhận giá hiện tại.
- Bảo tàng Mỹ thuật: nguồn tìm kiếm ghi 30.000 VND nhưng mở trực tiếp lỗi 502; giữ ở trạng thái cần kiểm tra, chưa nâng thành dữ liệu vận hành.

## Bổ sung lần rà soát tiếp theo

- Củ Chi: nguồn đơn vị công bố 35.000 đồng phí tham quan và 100.000 đồng phục vụ, hướng dẫn cho khách ngoại quốc từ 01/02/2026; tổng hai khoản 135.000 đồng/người. Không gồm xe và ăn uống.
- Huynh Hoa: nguồn đơn vị nêu 06:00–22:00 cả tuần và 73.000 đồng/ổ; giữ giá món riêng với vé tham quan.
- Bảo tàng Phụ nữ Nam Bộ: giờ sáng 07:30–11:30, chiều 13:30–17:00; chưa gán ngày trong tuần vì nguồn chưa nêu.
- Bảo tàng TP.HCM: thêm đầu mối liên hệ; không áp dụng ưu đãi năm 2024 cho năm 2026.
- FITO: loại nguồn website có nội dung không liên quan; tài liệu Sở năm 2022 được giữ như nguồn lịch sử, chưa coi là giờ hiện hành.
- Người dùng đã đồng ý dùng ước tính nội bộ. Xem SIMULATION-README.md và planner-simulation-v1.json; dữ liệu nghiên cứu vẫn không bị gắn nhãn đã xác nhận.

## Danh sách xử lý

| ID | Địa điểm | Nhóm xử lý | Còn thiếu |
|---|---|---|---|
| LL-R01 | Dinh Độc Lập | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review |
| LL-R02 | Bảo tàng Chứng tích Chiến tranh | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review |
| LL-R03 | Bảo tàng Thành phố Hồ Chí Minh | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation |
| LL-R04 | Bảo tàng Lịch sử Thành phố Hồ Chí Minh | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review |
| LL-R05 | Bưu điện Trung tâm Sài Gòn | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation |
| LL-R06 | Bảo tàng Mỹ thuật Thành phố Hồ Chí Minh | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation |
| LL-R07 | Bảo tàng Phụ nữ Nam Bộ | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation |
| LL-R08 | Bảo tàng Tôn Đức Thắng | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, admission_or_explicit_free_confirmation |
| LL-R09 | Chùa Giác Lâm | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation |
| LL-R10 | Địa đạo Củ Chi | deferred_operator_confirmation | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, exact_meeting_point, named_host_and_bookable_activity |
| LL-R11 | Chợ Bến Thành | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation, exact_meeting_point |
| LL-R12 | Chợ Tân Định | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation |
| LL-R13 | Chợ An Đông | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation |
| LL-R14 | Chợ Bình Tây | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation |
| LL-R15 | Phố ẩm thực Hồ Thị Kỷ | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation, exact_meeting_point |
| LL-R16 | Phố đi bộ Nguyễn Huệ | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation, exact_meeting_point |
| LL-R17 | Hội quán Tuệ Thành | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation |
| LL-R18 | Bảo tàng Y học Cổ truyền Việt Nam FITO | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation |
| LL-R19 | Phố Đông y Quận 5 | deferred_operator_confirmation | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation, exact_meeting_point, named_host_and_bookable_activity |
| LL-R20 | Bảo tàng Áo Dài | outside_current_areas | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation, supported_area |
| LL-R21 | Chợ Thiếc | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation |
| LL-R22 | Chợ Phạm Văn Hai | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation |
| LL-R23 | Chợ Bà Hoa | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation |
| LL-R24 | Hẻm 200 Xóm Chiếu | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation, exact_meeting_point |
| LL-R25 | Bánh mì Hòa Mã | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation |
| LL-R26 | Bánh mì Huỳnh Hoa | inner_city_priority | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, admission_or_explicit_free_confirmation |
| LL-R27 | Nhà bạc Việt Nam | deferred_operator_confirmation | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation, named_host_and_bookable_activity |
| LL-R28 | Làng nghề Một Thoáng Việt Nam | deferred_operator_confirmation | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation, exact_meeting_point, named_host_and_bookable_activity |
| LL-R29 | Làng bánh tráng Phú Hòa Đông | deferred_operator_confirmation | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation, exact_meeting_point, named_host_and_bookable_activity |
| LL-R30 | Nghề làm lồng đèn Hòa Bình | deferred_operator_confirmation | operator_group_capacity, approved_transfer_edges, approved_group_service_cost, admin_release_review, current_operating_windows, admission_or_explicit_free_confirmation, exact_meeting_point, named_host_and_bookable_activity |

## Tích hợp CSDL hiện tại

Bộ tạo tour hiện đọc snapshot đã công bố, dùng UUID, bảng giờ mở cửa và cạnh di chuyển. Không thể thay thẳng bằng ID LL-Rxx hoặc ma trận 5 khu vực. Bản v2 được lưu riêng ở private.planner_dataset_revisions; không thay snapshot đang chạy.

Trước khi phát hành cần ánh xạ slug sang UUID, chốt điểm gặp và sức chứa, giá dịch vụ nhóm, cạnh di chuyển đi/về, rồi mới tạo snapshot. Khu vực không đủ điểm phải báo không có tuyến phù hợp; không hứa luôn có kết quả.

## Nguồn đối chiếu

- [verified-dinh-2026](https://dinhdoclap.gov.vn/gio-tham-quan-va-gia-ve-moi-nhat-ap-dung-tu-01-8-2025-2/) — page_read; 2026-09-11.
- [verified-war-2026](https://ticket.baotangchungtichchientranh.vn/terms-and-conditions.html) — search_full_extract; 2026-09-11.
- [verified-history-2026](https://www.baotanglichsutphcm.com.vn/tham-quan/chinh-sach) — page_read; 2026-09-11.
- [research-finearts-2026](https://www.baotangmythuattphcm.com.vn/tham-quan) — search_extract_direct_fetch_502; 2026-09-11.
- [verified-tonducthang-2026](https://baotangtonducthang.vn/) — page_read; 2026-09-11.
- [city-museum-contact-2026](https://hcmc-museum.edu.vn/luu-tru/4677) — search_extract; 2026-09-11.
- [women-museum-2026](https://baotangphunu.com/) — page_read; 2026-09-11.
- [cuchi-fee-2026](https://diadaocuchi.com.vn/thong-bao-tang-gia-ve-phuc-vu-huong-dan-399.html) — search_full_extract_direct_timeout; 2026-09-11.
- [fito-source-rejected-2026](https://fitomuseum.com.vn/) — page_read_unrelated_content; 2026-09-11.
- [fito-government-2022](https://svhtt.hochiminhcity.gov.vn/documents/10184/354475/to%2Bgap%2B10%2Bbao%2Btang%2Bhoan%2Bthien%2B%28ng%C3%A0y%2B21.11.2022%29.pdf/cd343255-8c41-4250-bd9a-92c203837de8) — search_extract; 2026-09-11.
- [huynhhoa-2026](https://banhmihuynhhoa.vn/review-banh-mi-huynh-hoa-gia-bao-nhieu/) — search_extract; 2026-09-11.

Chạy lại: node scripts/prepare-planner-dataset-v2.mjs. File gốc trong Downloads không bị chỉnh sửa.
