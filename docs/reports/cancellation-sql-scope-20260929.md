# Kiểm chứng local và ranh giới sửa quyền

> Ghi chép lịch sử trước khi được duyệt mở rộng quyền local. Trạng thái mới nhất: `cancellation-permissions-final-20260929.md`. Các câu “chưa sửa/chưa được duyệt” bên dưới chỉ mô tả thời điểm ghi chép này.

Ngày 29/09/2026; nhánh `codex/cancellation-local`, HEAD `0a76f9f`.

## Kết quả chạy mới

- Research cancellation: `node scripts/test-research-cancellation-local.mjs --workdir D:/LocalLensSqlAudit/20260928-research-baseline --test`: 123/123; transaction rollback.
- Research integration: `node scripts/test-research-integration-local.mjs --workdir D:/LocalLensSqlAudit/20260928-research-baseline`: hai lượt nâng cấp giữ dữ liệu nghiệp vụ; từ chối grant legacy vượt mức; 82 kiểm tra quyền đạt; DDL và dữ liệu rollback. Không phải kiểm thử hosted.
- Public cancellation: `runtime_cancellation_test.sql` qua psql trong container `supabase_db_localens-cancellation-clean-final`, pgTAP cài trong giao dịch: 94/94, finish không có lỗi, ROLLBACK. Không chứng nhận RPC reviewed-demo.
- `git diff main HEAD -- supabase scripts docs/security tests/unit/supabase` rỗng: bản vá hiện tại không thay các nguồn SQL, checker hoặc test SQL so với main local. Đây là đối chiếu nguồn, không thay thế chạy baseline trong checkout khác.

## Phân loại đã xác minh từ nguồn

| Thay đổi cần xem xét | Lý do | Bắt buộc cho Word? | Ảnh hưởng DB/data | Test | Có nên áp dụng |
|---|---|---|---|---|---|
| Xử lý `RESET ROLE` tại `20260913010000_guide_demo_schedule.sql:128` | Không khớp quy tắc giữ session role của checker | Không phải nghiệp vụ Hủy | Liên quan migration HDV, không phải bản vá UI | artifacts.test.ts | Không sửa lịch sử migration tự động; cần quyết định phạm vi |
| Đối chiếu `auth.uid()` trong migration reviewed-demo và research cũ | Checker cấm toàn bộ lịch sử sử dụng auth.uid; SQL cũ có sử dụng thật | Không | Có thể liên quan cách nhận diện người dùng nhiều RPC | artifacts.test.ts | Không thay toàn repo bằng regex hoặc tắt kiểm tra |
| Đồng bộ matrix/grants/policies | Các đối tượng demo/research mới chưa được liệt kê đầy đủ | Tài liệu kiểm chứng, không trực tiếp nghiệp vụ | Bản thân manifest không đổi DB; khai báo owner không được dùng để che sai quyền SQL | rls-matrix.test.ts | Chỉ cập nhật sau khi xác minh quyền cuối |
| Reviewed-demo definer ownership | Các hàm reviewed_demo_begin/pay/availability được tạo SECURITY DEFINER, không có ALTER OWNER tương ứng trong migrations được tìm thấy | Không phải riêng Hủy | Sửa owner/forced RLS có thể làm booking và payment mất quyền nếu thiếu policies | Cần thêm test quyền và regression booking/payment local | Cần duyệt mở rộng quyền ngoài Hủy trước khi sửa |
| Seed relation inventory | Danh sách THESIS_DEMO_RELATIONS chưa chứa các bảng demo/research mới | Không | Script có khả năng ghi dữ liệu khi được gọi apply; không được chạy hosted | thesis-demo-cloud-seed.test.ts | Chỉ sửa local sau khi chốt inventory và phân loại, không backfill |
| SQL Hủy public/research hiện có | Kiểm tra nghiệp vụ và tính nguyên tử | Có | Candidate local; chưa xác nhận tương đương hosted | 94 public + 123 research + integration đạt | Chưa áp hosted chỉ dựa vào kết quả local |

## Quyết định triển khai

Ruling: Không ép chín lỗi thành xanh bằng việc sửa các migration lịch sử, chấp nhận postgres-owner trong matrix hoặc nới quyền browser. Kế hoạch đã duyệt yêu cầu dừng nếu phải sửa quyền runtime ngoài Hủy; nguồn reviewed-demo cho thấy ranh giới này cần được giải quyết trước.

Chưa sửa SQL, chưa commit báo cáo này, chưa push/merge/deploy, chưa kết nối thay đổi Supabase thật. Cần phê duyệt phạm vi bổ sung: hardening quyền reviewed-demo booking/payment và tương thích lịch sử HDV/research, chỉ trong local; giữ nguyên API và hành vi đã duyệt. Sau đó mới có thể hoàn tất matrix và kiểm thử toàn bộ.
