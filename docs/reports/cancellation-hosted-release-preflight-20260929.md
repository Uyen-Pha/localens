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
