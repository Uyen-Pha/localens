# Kiểm tra trước phát hành hosted

Nguồn đã push: `03eeec6`, nhánh `codex/cancellation-local`. Main vẫn `cd98e3f`.

## Kết nối và backup

- Dashboard dự án `twsdtfotrkljgbfsrmgz` truy cập được; Free Plan không có scheduled backup.
- `localens-guide-release/supabase/.temp/linked-project.json` chỉ có ref/name/organization, không có thông tin đăng nhập Postgres.
- Các checkout đã kiểm tra chỉ có `.env.example`; không tìm thấy cấu hình pgpass/biến kết nối quản trị trong môi trường hiện tại. Không khẳng định đã kiểm tra mọi nơi trên máy.
- Chưa tạo database backup, chưa thử restore và chưa áp SQL thật. Không reset mật khẩu.

## GitHub CI, run 36523631470

- `quality-demo`: ba test lỗi `LOCAL_DIRECTORY_REQUIRED`; fixture dùng đường dẫn `D:/...` trong khi runner Linux kiểm tra đường dẫn tuyệt đối theo hệ điều hành. Không phải lý do để nới guard runtime.
- Bản sửa chỉ dùng `node:path.resolve` cho fixture argument ở hai file test; bổ sung kiểm tra đường dẫn tương đối vẫn bị từ chối. Không tạo thư mục hoặc chạy SQL qua các test này.
- Chạy lại local hai file: 38/38 đạt; scoped lint và diff check đạt. Chưa chứng nhận toàn bộ CI Linux đạt cho bản sửa mới.
- `runtime-local`: thất bại ngay khi dựng DB tại migration `20260916100000_research_demo_workflow.sql`, do thiếu dòng manifest xác nhận môi trường thesis-demo. Log báo `Authorized demo environment required`. Chưa tới bước chạy pgTAP.
- Runner kiểm chứng local chuyên biệt trước đây đã dựng prerequisite manifest/catalog rõ ràng; `db:verify` CI hiện chạy Supabase start trên toàn bộ lịch sử nên không có prerequisite đó. Không tắt hoặc bỏ guard trong migration để làm CI xanh.

## Điều kiện còn thiếu

1. Cách dựng fixture prerequisite cho CI local cần được triển khai/kiểm thử riêng, không áp manifest giả vào hosted.
2. Kết nối sao lưu Postgres thật và kiểm thử restore; sau đó đối chiếu migration, version, owner/ACL/policy thực tế.
3. Chỉ merge/deploy/áp SQL khi các điều kiện phát hành đạt. Không chạy seed/backfill hosted, không xóa recovery worktrees.

## Kiểm tra lại bằng phiên Dashboard hiện có

- Đã chạy `BEGIN READ ONLY` / `SELECT` / `ROLLBACK` trong SQL Editor của đúng dự án. Phiên truy vấn có role `postgres`, PostgreSQL `17.6`.
- `supabase_migrations.schema_migrations` không có version `20260928100000`. Đây chỉ là bằng chứng về lịch sử ghi nhận, không chứng minh toàn bộ logic cancellation chưa từng được áp bằng cách khác.
- Xuất JSON từ kết quả SQL Editor đọc được 1.319 mục: 674 constraint, 189 function, 355 policy, 3 schema và 98 table metadata trong phạm vi public/private (schema metadata có thêm auth).
- Có `public.cancel_booking(uuid,text,text,text)` với owner `localens_cancellation_customer_rpc_owner`; EXECUTE cho authenticated. Hai hàm normalize deadline của migration mới không xuất hiện trong snapshot này. Cần đối chiếu định nghĩa trước khi áp, không dùng riêng lịch sử migration để suy luận.
- Định nghĩa hosted đang từ chối mọi booking khác `pending_payment`; chưa có nhánh `confirmed` với điều kiện còn ít nhất 48 giờ như migration ứng viên. Đây là khác biệt logic đã quan sát, không chỉ khác lịch sử migration. Migration gần nhất được ghi nhận là `20260926120000_guide_demo_schedule_visibility`.
- Export JSON đã đọc được trong phiên trình duyệt (927.436 ký tự); tải CSV chưa nhận được file. Chưa có artifact snapshot bền vững, chưa backup dữ liệu hàng, chưa kiểm thử restore. Không coi kết quả này là full backup hoặc điều kiện rollback đã đạt.
- Không cần mật khẩu để thực hiện các truy vấn đọc nêu trên. Không reset credential, không chạy INSERT/UPDATE/DDL, không áp migration hosted.
- Kiểm tra aggregate chỉ đọc: `public.bookings` có 5 dòng, `private.capacity_holds` có 5 dòng; 0 dòng vi phạm các điều kiện dương của thời hạn tương ứng trong truy vấn. Đây không phải kiểm chứng đầy đủ mọi điều kiện migration hoặc mọi bảng booking demo khác.
- Tài liệu Supabase khuyến nghị dự án Free tự xuất bằng CLI `db dump`; snapshot SQL Editor chỉ là bằng chứng cấu hình, không thay thế dump/restore đầy đủ: https://supabase.com/docs/guides/platform/backups

## CI tiếp theo: run 36524845407

- Commit `d416d64` đã push; cả quality-demo, runtime-local và demo-e2e vẫn thất bại. Không coi kết quả Windows trước đó là chứng nhận CI Linux.
- runtime-local vẫn dừng tại manifest prerequisite khi `db:start`, trước `db:reset` và pgTAP. Đang xử lý bootstrap local dùng chung; không sửa guard migration hosted.
- quality-demo và demo-e2e đang được chẩn đoán độc lập. Chưa merge main hoặc deploy Production.

### Sau bản sửa bootstrap local (chưa push)

- Fresh replay local đã qua lỗi manifest/catalog và dừng ở `20260929020000` với `MISSING_PLATFORM_AUTH_GRANT_AUTHORITY`. Chưa xác nhận reset/replay toàn bộ thành công, không gọi database gate là đạt.
- Kiểm tra hosted riêng bằng `has_schema_privilege(current_user, 'auth', 'USAGE WITH GRANT OPTION')` trả `false`; owner schema auth là `supabase_admin`, current_user là `postgres`.
- Đây là thiếu quyền cấp schema, khác với thiếu mật khẩu kết nối. Không suy luận rằng tìm/reset mật khẩu sẽ làm migration này chạy được. Không gỡ guard hoặc tự cấp rộng quyền trên hosted.
- Kiểm chứng lại bởi agent chính: 68 test đạt, 1 test tạo file symlink bị skip do Windows (ba file local-ci-bootstrap, task16-gate, run-runtime-itinerary-e2e); lint bảy file bootstrap/gate/test đạt. Kiểm thử admin-tours riêng đạt 3/3. Không cộng các lần chạy lặp thành số test mới.

### Checkpoint mã và giao diện

- Test được cập nhật theo nhãn tài khoản và đường dẫn Đơn đặt tour đã duyệt; không quay UI về phiên bản cũ để khớp test.
- Sửa màu chữ gợi ý Planner và màu focus tài khoản bằng token màu hiện có; không đổi bố cục.
- Sửa riêng adapter demo của trang tài khoản: số điện thoại rỗng được chuyển thành `null` theo contract sẵn có. Test dùng composition demo thật kiểm tra lưu tên khi phone null và giữ nguyên phone đã có.
- Agent chính chạy lại 12/12 test tài khoản, typecheck exit 0 và lint toàn bộ file TS/JS thay đổi exit 0. File `next-env.d.ts` sạch; không sửa cấu hình typecheck.
- Worker báo các browser checks trọng tâm đã qua gồm food/shell, hủy đơn demo qua Khách/QTV/HDV, và accessibility trang chủ. Đây không phải smoke test hosted hoặc chứng nhận toàn bộ E2E.
- E2E còn baseline cần đối chiếu: legacy fixed-tour checkout khác adapter reviewed hiện tại, một số giả định bố cục cũ, và yêu cầu CSS `nowrap` trong booking-total test (giá/kích thước không tràn đã qua, thuộc tính trả `normal`). Không xóa assertion hoặc bỏ test để giả lập CI xanh.
- Chưa chạy lại toàn bộ CI sau checkpoint; không merge, deploy hoặc áp SQL hosted từ checkpoint này.

### Truy vấn kiểm tra hosted đã dùng (chỉ đọc)

```sql
BEGIN READ ONLY;
SELECT current_user AS db_role,
       current_setting('server_version') AS server_version,
       EXISTS (
         SELECT 1 FROM supabase_migrations.schema_migrations
         WHERE version = '20260928100000'
       ) AS cancellation_migration_recorded;
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 12;
SELECT 'bookings' AS relation, count(*) AS rows,
       count(*) FILTER (
         WHERE hold_duration_seconds <= 0 OR hold_expires_at <= created_at
       ) AS incompatible_deadlines
FROM public.bookings
UNION ALL
SELECT 'capacity_holds', count(*),
       count(*) FILTER (WHERE expires_at <= created_at)
FROM private.capacity_holds;
ROLLBACK;
```

Các truy vấn không gọi RPC nghiệp vụ, không đặt/hủy đơn và không cập nhật lịch sử migration.
