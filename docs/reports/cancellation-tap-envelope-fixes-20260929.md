# Chốt hai phát hiện kiểm chứng TAP — local

Nền: `88cf0d1`, nhánh `codex/cancellation-local`.

## Phạm vi

- Chặn command tag COMMIT trong đầu ra rollback-only; yêu cầu đúng một BEGIN trước toàn bộ TAP và một ROLLBACK sau plan/assertions.
- Nhận diện `not ok ... # TODO` như TODO, không cộng vào số passed. Assertion lỗi thông thường vẫn làm kiểm thử thất bại.
- Runner reviewed bỏ BEGIN của suite nhúng vì đã tự mở giao dịch ngoài. Suite vẫn giữ ROLLBACK cuối.
- Không đổi SQL migration, API, giao diện, luật Hủy đơn hoặc dữ liệu hosted.

## Bằng chứng

- Sáu ca hồi quy mới đã thất bại trước sửa; sau sửa Node validator đạt 31/31.
- Kiểm tra integration đầu tiên phát hiện BEGIN lặp trong runner reviewed; sau sửa runner đạt 93/93, không SKIP/TODO.
- Runner remaining: 313 passed + 1 SKIP lịch sử, không TODO. Riêng cancellation 122/122 passed.
- Lint ba file JavaScript sửa, static gate 58 migrations và diff whitespace đạt.
- Review độc lập ba file: không có phát hiện cần sửa trong hợp đồng kiểm chứng đã chốt.
- Toàn bộ Vitest: 2637/2637 passed, 0 failed, 0 pending; exit 0. Chạy một worker, không thay test/timeout để làm xanh: `corepack.cmd pnpm exec vitest run --maxWorkers=1 --testTimeout=30000 --reporter=json --outputFile=.local-tap-envelope-suite.json`.
- Không chạy lại build ứng dụng vì chỉ sửa công cụ kiểm thử JavaScript; kết quả này không phải bằng chứng đã phát hành hoặc kiểm thử hosted.

## Giới hạn

Validator kiểm tra transcript psql của các runner local đã kiểm soát, không phải cơ chế ngăn SQL COMMIT trước khi thực thi hoặc chứng minh an toàn cho SQL/đầu ra tùy ý. Các runner chỉ dùng Docker local cố định, không nhận URL hosted. Một SKIP deadline lịch sử vẫn được báo riêng, không coi là PASS. Không push, merge, deploy hoặc áp migration lên Supabase thật.
