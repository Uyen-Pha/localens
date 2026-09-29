# Hoàn thiện Hủy đơn và kiểm chứng quyền — local

Ngày 29/09/2026. Nhánh `codex/cancellation-local`, nền trước bản vá `21bfeb2`.

## Phạm vi

Báo cáo này tổng hợp và thay thế trạng thái tiến độ trong `cancellation-sql-scope-20260929.md`, `reviewed-permissions-local-20260929.md` và ghi chú inventory. Chỉ sửa/test local theo phạm vi bổ sung quyền đã được người dùng duyệt. Không đổi giao diện, chữ ký/body RPC, dữ liệu đơn thật hay cơ chế thanh toán mô phỏng. Không push, merge, deploy, áp SQL hosted hoặc backfill.

## Bảng quyết định

| Thay đổi | Lý do | Bắt buộc cho Word? | Ảnh hưởng DB/data | Test | Có nên áp dụng |
|---|---|---|---|---|---|
| Quy tắc Hủy public/research hiện có | Chủ đơn, deadline, mốc 48 giờ, replay và tranh chấp thanh toán | Có, theo từng trạng thái và runtime | Thao tác hủy hợp lệ đổi trạng thái/lịch sử/chỗ; không tự hoàn tiền thật | Public/research pgTAP và kiểm thử concurrency, ghi riêng bên dưới | Hoàn thiện local; hosted cần duyệt riêng |
| `20260929030000_reviewed_rpc_permissions.sql` | Bỏ owner postgres của 10 RPC reviewed; giữ maintenance và đọc email chính chủ | Không phải yêu cầu giao diện; cần để RPC chạy với quyền giới hạn | Role, grant, policy, FORCE RLS, timeout; không thay body/API hoặc business rows | Apply hai lần, quyền actor, booking/checkout/cancel, quyền vượt mức | Candidate local, không tự áp thật |
| `20260929040000_remaining_runtime_permissions.sql` | Giới hạn quyền guide/research; bổ sung phụ thuộc cần thiết sau chuyển owner | Không thêm nghiệp vụ mới | Hai role mới; owner/policy/grant/timeouts; FORCE RLS revision links; không sửa dữ liệu nghiệp vụ | API/body/all-existing-role ACL/row invariance, guide, research, deadline, cancellation và role bất thường | Candidate local, phải so hosted drift trước khi duyệt áp thật |
| Inventory, grant manifest và phân loại INVOKER/DEFINER | Khai báo cũ thiếu đối tượng và nhầm INVOKER thành DEFINER | Tài liệu kiểm chứng | Không ghi DB | Gate đối chiếu hai chiều, mutation tests | Có thể commit cùng candidate |
| Parser trạng thái SQL cuối | Không chấp nhận owner trong comment, overload bị xóa nhầm, Auth grant bị che | Không đổi nghiệp vụ | Chỉ công cụ kiểm tra | Regression có quan sát RED rồi GREEN | Có |
| Hai ngoại lệ lịch sử có checksum | Giữ nguyên migration cũ thiếu wrapper / dùng RESET ROLE | Không | Không sửa lịch sử; không khẳng định file cũ có tính nguyên tử độc lập | Checksum mismatch và wrapper/role checks cho file mới | Chỉ chấp nhận đúng nội dung đã pin, không miễn trừ theo thư mục |

## Ranh giới kiểm chứng

- Inventory cuối: 58 migrations, 99 bảng, 24 views, 56 public RPC signatures, 125 internal functions. Đây là kiểm tra nguồn, không chứng nhận hosted.
- Matrix ghi explicit grants, không thay thế effective privileges, role inheritance hoặc mọi SQL động. Parser có hỗ trợ giới hạn cho mẫu SQL đã có; không phải trình thông dịch PostgreSQL tổng quát.
- Hai migration lịch sử giữ nguyên byte nội dung sau chuẩn hóa CRLF/LF: `20260911120000_reviewed_checkout.sql` và `20260913010000_guide_demo_schedule.sql`. Chỉ ngoại lệ wrapper/session-role được mô tả trong `migration-history-exceptions.json`; file mới vẫn kiểm tra nghiêm.
- Runner quyền dùng cố định Docker local `supabase_db_localens-release-20260929-verified`, không nhận URL hosted. DDL và rows của giao dịch thử rollback; sequence identity có thể tăng dù rollback.
- Phiên bản PostgreSQL local đã kiểm tra là 17.6. Preflight có kiểm tra quyền `MAINTAIN`; phải xác minh phiên bản hosted hỗ trợ quyền này trước khi đề xuất áp thật, không suy ra tương thích PostgreSQL cũ.
- Runner concurrency dùng baseline local riêng, giữ fixture tổng hợp đã commit để quan sát; không phải dữ liệu Supabase thật.
- Cancellation research suite được tái sử dụng với adapter **fixture** lịch sử 47h/49h: tạo qua gate 72h hiện tại rồi nối snapshot lịch sử. Không thay hàm production hay tắt trigger để làm test xanh.

## Kết quả cuối

- `node scripts/check-supabase-artifacts.mjs`: đạt, 58 migrations. Cả năm lỗi artifact/matrix còn lại đã hết ở focused rerun.
- `node scripts/test-reviewed-permissions-local.mjs`: 75 assertions, 14 giao dịch rollback. Bao gồm clean-role positive control, grant cột INSERT/REFERENCES, MAINTAIN, incoming/outgoing membership, password/unrelated relation/function, apply hai lần và ownership hỗn hợp.
- `node scripts/test-remaining-runtime-permissions-local.mjs`: 313 assertions, 19 giao dịch rollback. Gồm 35 invariant/workflow, 12 schema CREATE, 10 guide, 82 permissions, 32 deadline, 122 cancellation và 20 unsafe-role assertions.
- Public `runtime_cancellation_test.sql` chạy lại trên container `supabase_db_localens-cancellation-clean-final`: 94/94, finish không lỗi, rollback. Không nhầm với reviewed/research runtime.
- Research integration runner: hai lượt nâng cấp giữ nguyên business fields và 82 quyền/functional pgTAP đạt; chạy trên baseline local riêng, không phải chứng nhận candidate 040000.
- Research concurrency: 7/7 đạt trên baseline local riêng (cancel-first, payment-first 47h/49h, replay cùng/khác key, cùng key khác đơn, expiry trong lúc chờ lock). Fixture tổng hợp được giữ trong local.
- Focused final rerun: 156/156 (artifact, matrix, final-definer, admin-tours và supabase-portal-surface).
- Typecheck, lint các file sửa, `git diff --check`: đạt. `build:supabase`: đạt, 43 trang; dùng URL local `http://127.0.0.1:55441`, không deploy.
- Full Vitest lượt đầu: 2631/2633, hai lỗi `Fixed tour demo UI keeps editor values when opening and cancelling another dialog` và `Supabase PortalSurface (en) routes a signed-in admin by the database role`. Cả hai đạt khi chạy lại focused, không sửa UI hay nới assertion.
- Full Vitest cuối: **2633/2633 đạt, 0 lỗi, 0 bỏ qua**, với `corepack.cmd pnpm test:run --testTimeout=30000 --maxWorkers=2 --reporter=json --outputFile=.local-final-sql-suite-stable.json`. Báo cáo JSON giữ local, không commit. Kết quả lần chạy đầu vẫn được ghi để không che tính nhạy tải của hai test UI.
- Cảnh báo không chặn: Vite config-loader/tsconfig-paths và jsdom navigation chưa triển khai. Không sửa config toàn repo chỉ để xóa cảnh báo.

QC phát hiện test permission có thể xanh giả khi pgTAP được cài vào `public`: PUBLIC SELECT của view pgTAP gây đúng lỗi generic cần kiểm tra, che grant cột bị bỏ sót. Harness đã chuyển pgTAP sang `extensions`, thêm positive control cùng setup, kiểm tra grant thực sự tồn tại và đếm assertions. Sau đó quan sát RED thật (`caught: no exception`), sửa allowlist SQL và chạy lại GREEN. Schema CREATE của hai owner mới cũng có RED→GREEN. Không chỉ cập nhật kỳ vọng để làm test xanh.

Checksum SHA-256 candidate sau review (nội dung file local):

- `030000`: `5179F6F3B571B31D5156DEE4A518F5D8C36A219994D2EAF8BFA72786D71DC614`.
- `040000`: `0D4C2E6EF11C5D8D65448870CBCDD20A5480C13649436BE0199429C9BD79F5C4` (đã bỏ dòng trắng cuối file sau review, không đổi SQL).

## Rollback và điều kiện áp thật

1. Chưa có thay đổi hosted nên không có rollback Production cần thực hiện trong lượt này.
2. Local runners áp candidate trong giao dịch và rollback; lỗi psql đóng kết nối cũng rollback giao dịch chưa commit. Không reset container chia sẻ.
3. Trước mọi lần áp hosted cần phê duyệt riêng, snapshot schema/owners/ACL/policies/config, đối chiếu trạng thái thực tế, backup và thử restore. Không chạy seed/backfill.
4. Nếu apply lỗi trước COMMIT: rollback toàn giao dịch. Sau COMMIT: dùng migration bù đã kiểm chứng từ snapshot **chỉ** phục hồi owner/grant/policy/config liên quan; không khôi phục business rows cũ, không hồi sinh đơn đã hủy hoặc cộng lại chỗ lần hai.
5. Rollback code không tự rollback database. Không drop role bằng CASCADE và không dùng down migration suy đoán khi có dữ liệu mới.
