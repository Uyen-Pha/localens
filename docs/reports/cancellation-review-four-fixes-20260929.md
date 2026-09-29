# Bốn sửa bổ sung sau review — local

Nền: `97a5ba4`, nhánh `codex/cancellation-local`. Người dùng duyệt sửa cả bốn phát hiện trong local; không push, merge, deploy hoặc áp SQL hosted. Báo cáo này bổ sung cho `cancellation-permissions-final-20260929.md`.

## Thay đổi đã giới hạn

1. Candidate `20260929030000_reviewed_rpc_permissions.sql` kiểm tra quyền CREATE **hiệu lực** trên public/private/auth của reviewed owner, kể cả cấp qua PUBLIC. Nếu có quyền vượt phạm vi thì dừng trước khi cấp quyền mới. Không đổi body/API hay dữ liệu nghiệp vụ.
2. Runner SQL dùng validator kiểm tra số kết quả dự kiến, đánh số liên tục, một TAP plan đầy đủ, lỗi/bailout và ROLLBACK sau khi hoàn tất. Không chấp nhận đầu ra rỗng/chưa chạy hết. SKIP/TODO được báo riêng, không tính là assertion đã kiểm chứng.
3. Bộ phân tích thực hiện REVOKE theo hai bước rồi mới hợp nhất bản ghi: giữ GRANT OPTION còn hiệu lực khi nhóm cột chồng nhau; không làm quyền đã thu hồi xuất hiện lại.
4. Giữ nguyên chữ hoa/thường và giải mã dấu ngoặc kép của tên role được quote; chỉ lowercase tên không quote. Role có tên khác không được hưởng nhầm allowlist.

Không chỉnh giao diện, runtime ứng dụng, migration lịch sử đã áp, schema/data hosted hoặc quy tắc Hủy đơn. File 030000 vẫn là candidate local chưa phát hành, không phải sửa migration đã áp thật.

## Kiểm chứng

- Ba regression checker đã quan sát RED (hai thứ tự cấp quyền chồng cột và một role quote khác case), sau sửa đạt; positive control cho role quote đúng và thu hồi grant option vẫn đạt.
- Review độc lập hai file checker/test không phát hiện hồi quy trong phạm vi bốn yêu cầu.
- 99 kiểm thử artifact/matrix/final-definer đạt; static gate 58 migrations đạt, không cần thay manifest để che sai lệch.
- `node --test scripts/validate-local-tap.test.mjs`: 25/25 đạt. Đây là bộ Node riêng, không cộng vào số Vitest.
- Build Supabase-mode local đạt, 43 trang; không deploy.
- Reviewed SQL runner: 93/93 đạt, không SKIP/TODO, 20 giao dịch rollback. Có sáu trường hợp CREATE trực tiếp/qua PUBLIC trên ba schema và positive control role sạch.
- Remaining SQL runner: 313 đạt + 1 SKIP deadline lịch sử, không TODO, 19 giao dịch rollback. Riêng cancellation 122/122 đạt, không SKIP.
- Typecheck, lint sáu file JavaScript/TypeScript sửa và `git diff --check`: đạt.
- Full Vitest: 2634/2637 đạt, ba timeout trong lúc có lượt Vitest của agent chạy trùng (lượt trùng đã dừng). Không gọi lượt này là toàn bộ xanh. Ba tên test:
  - `typecheck release contract leaves tracked source unchanged after a successful project typecheck` (121,7 giây, giới hạn riêng 120 giây).
  - `Task 13 RLS/RPC access matrix fails closed when generated policies or later definer hardening drift`.
  - `Task 13 RLS/RPC access matrix checks dynamic owner policy command, roles, and predicates`.
- Chạy lại hai file chứa cả ba trường hợp với một worker: **19/19 đạt**, không sửa timeout/assertion/test source để làm xanh. Lệnh: `corepack.cmd pnpm exec vitest run tests/unit/release/typecheck-clean-contract.test.ts tests/unit/supabase/rls-matrix.test.ts --maxWorkers=1 --testTimeout=30000`. Không refactor phần ngoài phạm vi bốn lỗi. Đây là kết quả chạy lại riêng, không đổi kết quả full-run trước thành 2637/2637.

Checksum SHA-256 của candidate 030000 sau sửa preflight: `3947E44BA7CDFF73817C129778A37AACF5A7F1CDEC99894B6447130592F623FD`. Candidate 040000 không đổi trong lượt này.

## Giới hạn được ghi rõ

`research_deadline_integration_test.sql` có nhánh lịch sử chủ động SKIP một nhóm khi database full-release sạch không có fixture trước nâng cấp. Validator mới báo rõ trạng thái này; không chuyển thành PASS và không tạo lịch sử giả để làm test xanh. Các kiểm thử trên baseline nâng cấp riêng ở báo cáo trước không thay thế kiểm thử hosted.

Các SQL runner chỉ chạy Docker local rồi rollback DDL/rows của giao dịch thử. Sequence local có thể tăng dù rollback. Không đụng Supabase thật. Áp hosted vẫn cần duyệt riêng, kiểm tra phiên bản PostgreSQL và đối chiếu quyền thực tế.
