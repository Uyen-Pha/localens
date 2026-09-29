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

## Kiểm chứng tiếp theo: bootstrap platform local

- Runner dựng platform trước trong container local đã kiểm tra quyền sở hữu, bổ sung prerequisite auth qua `supabase_admin` của chính container đó, rồi khôi phục và chạy nguyên chuỗi migration. Không sửa migration lịch sử hoặc cấp quyền hosted.
- `node scripts/test-local-ci-bootstrap.mjs`: fresh và reset đều đạt 60 migration được CLI ghi nhận (58 migration nguồn + 2 fixture local). Guard thiếu manifest vẫn từ chối; cleanup container kiểm thử đạt.
- Test hồi quy lỗi khôi phục thư mục đã thấy RED (`ENOTEMPTY` che lỗi CLI gốc), sau sửa đạt 18 test, 1 skip do quyền symlink Windows. Giữ lỗi gốc/status và đường dẫn phục hồi; không xóa đệ quy file phát sinh bất ngờ.
- `pnpm db:verify` đã qua bootstrap và tới pgTAP, nhưng chưa đạt: lựa chọn test mặc định chạy đệ quy cả fixture SQL và các suite cần runner/transaction riêng (40 file, 1.896 assertion được báo). Có lỗi thiếu TAP plan, fixture và kiểm tra quyền; đang tách nguyên nhân, chưa coi database gate đạt.
- `pnpm db:static` đạt 58 migration; lint hai file wrapper/test và diff check đạt. Đây không thay thế pgTAP hoặc kiểm chứng hosted.
- Chưa push, merge, deploy hoặc áp migration lên Supabase thật trong lượt kiểm chứng này.

### Sửa orchestration và kiểm thử hồi quy

- Chọn đủ 27 suite thực thi: 23 suite database và 4 suite cần fixture/transaction. Không chạy SQL baseline hoặc prerequisite như một pgTAP suite; không loại bỏ suite nghiệp vụ.
- Bảo vệ cleanup khi còn thư mục migration phục hồi. Agent chính chạy lại 5 file kiểm thử runner: 78 đạt, 1 skip Windows; typecheck và scoped lint đã đạt trước các thay đổi SQL fixture cuối.
- Bộ unit đầy đủ ghi nhận 2.655 đạt, 2 lỗi, 1 skip. Một lỗi là regression RED được thêm trong lúc suite đang chạy, đã sửa; lỗi còn lại là checksum CSS Planner chưa cập nhật sau thay đổi màu đã duyệt ở checkpoint trước. Hai file liên quan chạy lại đạt 27 test, 1 skip. Chưa gọi lượt unit đầy đủ là đạt.
- Kiểm thử identity đổi từ kỳ vọng lỗi quyền bảng sang kiểm tra UPDATE hồ sơ người khác trả 0 dòng: migration account hiện có cho phép sửa các cột cá nhân, RLS vẫn chặn chéo tài khoản. Không thay quyền hoặc policy.
- Kiểm thử manifest đối chiếu chính xác cả hai policy SELECT cho runtime owner đã có và policy migration owner. Xóa fixture prerequisite chỉ trong transaction kiểm thử, cuối suite rollback khôi phục; không xóa dữ liệu hosted.
- Người dùng chọn giữ luồng booking đã duyệt và kiểm thử bằng Supabase local, không bổ sung đặt tour offline.

### Database gate local đạt sau đồng bộ generated types

- Đã xuất types từ một container local mới, kiểm tra diff rồi tái tạo `database.types.ts` bằng generator hiện có. Bổ sung types cho các cột profile, bảng/RPC reviewed/research/guide đã tồn tại trong migration; loại kiểu ghi của view chỉ đọc. Không tạo hoặc sửa schema.
- `pnpm db:verify` chạy lại exit 0: fresh/reset đủ 60 migration mỗi lượt, database lint, 27 suite/2.089 TAP results, concurrency, generated-types check và cleanup đều đạt. Suite deadline giữ nhánh skip có chú thích cho fixture lịch sử không tồn tại ở fresh DB; không suy diễn thành kiểm chứng upgrade dữ liệu hosted.
- Log cuối: `.local-db-verify-types-final.log`; các log thất bại trước được giữ riêng. Reviewer chỉ đọc không tìm thêm vấn đề trong diff bootstrap/cleanup/SQL fixture.
- `pnpm build:demo` exit 0, 43 trang; typecheck sau cập nhật generated types exit 0 và lint các file script/type/test liên quan exit 0. Chưa chứng nhận toàn bộ E2E hoặc CI GitHub.

### Phạm vi booking và kiểm thử giao diện tiếp theo

- Theo lựa chọn của người dùng, giữ booking Supabase đã duyệt, không thêm booking offline. Đã thêm entry point local riêng `test:e2e:runtime-reviewed-booking`, tái sử dụng runner/container tạm hiện có; không dùng URL database do bên ngoài truyền vào.
- Các RPC reviewed (`reviewed_demo_begin`, `reviewed_demo_checkout`, `reviewed_demo_read`) khác luồng fixed-tour cũ. Phân công QTV vẫn là local state, không tạo liên kết dữ liệu mới với reviewed booking.
- Worker đã chạy hai luồng reviewed Việt/Anh đạt trước khi siết chặn chuyển hướng mạng. Lượt xác nhận sau thay đổi guard mạng dừng ở tải catalog (2 lỗi), vì vậy chưa chứng nhận bản guard mới đạt. Không dùng kết quả cũ để kết luận toàn bộ booking đã xanh.
- Hai luồng Planner Việt/Anh đạt từ tạo/chỉnh yêu cầu đến duyệt, báo giá và thanh toán mô phỏng. Lượt demo E2E trên static build ghi nhận 20 đạt, 16 lỗi; đang phân biệt selector cũ, fixture build và khác biệt runtime, không bỏ assertion nghiệp vụ để làm xanh.
- Unit đầy đủ lượt hai ghi nhận 2.662 đạt, 2 lỗi, 1 skip. Hai lỗi là chờ lazy admin shell và timeout của một test chạy ba checker độc lập. Đã giữ nguyên assertion, chờ shell tương tác được và tách ba checker thành ba test; chạy lại lần lượt 58/58 và 20/20 đạt. Cần kết quả full-suite sau sửa trước khi xác nhận gate tổng.
- Lint toàn bộ file TS/JS thay đổi và file runner/test mới đạt. Các artifact Next sinh trong lúc chạy local chưa được coi là thay đổi phát hành.
- Chưa push, merge, deploy hoặc thay đổi Supabase hosted trong lượt này.

### Đối chiếu CI cũ với giao diện đã duyệt

- Review nguồn xác định các suite runtime cũ còn đòi secure-portal heading, planner `recommend-itinerary`, booking `begin_fixed_tour_booking`, và bảng phân công runtime không còn được mount tại route đã duyệt. Đây là kết quả đối chiếu nguồn, không phải kết quả chạy lại CI GitHub.
- Đã cập nhật selector/readiness của `runtime-auth.spec.ts` theo đúng màn hình Khách/HDV/QTV; giữ kiểm tra phiên đăng nhập, quyền vai trò, dữ liệu tài khoản khác và logout. Chưa chạy live suite auth sau sửa.
- Không xóa suite RPC legacy hoặc giả lập tích hợp Admin fixture với reviewed booking. Cần tách setup RPC khỏi giao diện cũ và giữ kiểm tra replay/conflict, expiry enforcement, cancellation và assignment authorization trước khi gọi toàn bộ CI là đạt.
- Lint toàn repo exit 0 trước hai thay đổi test auth/CSS cuối; lint các file cuối do worker chạy đạt. Hai màu chữ Planner được thay bằng token hiện có, không đổi bố cục: browser override kiểm tra 12/12 đạt; stylesheet integrity 9/9 đạt. Kiểm chứng trên bản build mới còn chờ.

### Xác nhận reviewed booking sau sửa guard

- Worker Mendel chạy lại Chrome với Supabase local: 2/2 Việt/Anh đạt (1,1 phút browser), session 91016 exit 0 và cleanup `db:stop`, hoàn tất 15:19:27 ICT. Lượt này không lưu standalone log; `.local-reviewed-booking-chrome-final.log` là lượt lỗi trước, không dùng làm bằng chứng đạt.
- Nguyên nhân tải catalog: Chrome chặn WebSocket của Next sau document interception. Cấp quyền local-network chỉ cho origin ứng dụng loopback trong context kiểm thử; không sửa cấu hình hoặc quyền ứng dụng thật. Guard vẫn chặn origin ngoài allowlist, không theo redirect và từ chối mọi 3xx. GET/HEAD bỏ cache validators để lấy đủ body thay vì 304.
- Agent chính chạy riêng helper guard: 5/5 đạt, bao gồm Chrome thực, chặn redirect và origin ngoài local. Hai luồng đặt tour giữ nguyên assertion hold, owner, giá/số người, thất bại/thử lại, trạng thái persisted, đăng nhập lại và cô lập tài khoản.
- Đã nối command reviewed booking vào job CI local, log riêng theo cơ chế redaction hiện có; test cấu hình thấy RED do thiếu step, sau bổ sung đạt 9/9. Không bỏ các suite RPC legacy và không tuyên bố toàn bộ CI GitHub đã đạt.
- Build lại sau sửa màu Planner: exit 0, 43 trang; typecheck exit 0. Các include thư mục Next tạm phát sinh trong `tsconfig.json` đã được loại khỏi diff, giữ cấu hình gốc.

### Unit đầy đủ sau sửa và gate cuối

- Full sequential Vitest: exit 0, 2.668 đạt, 0 lỗi, 1 skip (quyền symlink Windows), 216 file. Agent chính đọc lại `.local-ci-unit-third.json`, `success: true`; không cộng các lượt chạy lặp vào số lượng này.
- Typecheck chạy lại sau khi trả cấu hình Next sinh tự động về nguyên trạng: exit 0. Scoped lint các file auth, reviewed booking, guard và visual cuối: exit 0.
- Fresh static browser: regression màu Planner, desktop/tablet all-route và ba viewport trang chủ đạt (6/7). Mobile all-route còn trường hợp bounds của textarea đang focus; tiếp tục phân biệt cuộn chưa ổn định với lỗi thật, không nới guard.
- Các gate local nêu trên không phải xác nhận toàn bộ CI runtime legacy, backup/restore hosted hoặc phát hành Production. Supabase thật không bị thay đổi.

### Sửa focus bàn phím trên mobile

- Kiểm tra 120 animation frame chứng minh ô mô tả Planner vẫn nằm một phần ngoài viewport sau Tab, không phải đang chờ cuộn. Thêm xử lý focus chỉ cuộn khi ô nhập/viền focus vượt biên màn hình, giữ nguyên nội dung và bố cục; ô đã hiện đủ không bị dịch chuyển.
- Regression no-scroll đã thấy RED với bản cuộn vô điều kiện, sau guard đạt 8/8. Agent chính chạy lại cùng test form hiện có: 11/11 đạt và lint hai file đạt.
- Bản focus trước guard đã build exit 0/43 trang và browser 8/8, bao gồm mobile all-route. Bản guard mới cần build/browser xác nhận cuối; không dùng kết quả revision cũ để suy diễn.
- Bộ unit đầy đủ 2.668 đạt nêu trên chạy trước bổ sung regression focus này; phần thêm sau được kiểm tra riêng, không cộng số test chồng lặp.

### Đăng nhập ba vai trò và build cuối

- Chrome auth local đạt 3/3, exit 0, 32,4 giây browser; log `.local-runtime-auth-rerun-02.log`. Giữ kiểm tra phiên qua reload/tab mới, danh tính, chặn sai vai trò, recovery và logout. Các bản sửa chỉ ở selector của test, không đổi quyền ứng dụng.
- Hai lượt trước được giữ riêng: selector Password không exact; selector tên QTV không khớp text ghép tên/email của header. Không dùng các log lỗi đó làm bằng chứng đạt.
- Cleanup cuối thành công. Thư mục chẩn đoán từ cảnh báo cleanup lượt đầu `C:/Users/Admin/AppData/Local/Temp/localens-runtime-itinerary-glSogC` được giữ nguyên; worker kiểm tra không còn container của project đó. Không xóa container cũ hoặc dữ liệu ngoài phạm vi.
- Build cuối với focus guard: exit 0, 43 trang, TypeScript trong build đạt; scoped lint file component/test cuối đạt. Không thay source migrations, chưa push/merge/deploy hoặc áp SQL hosted.
- Fresh static của đúng bản guard cuối: 8/8 browser test đạt (53,1 giây), gồm mobile all-route, tương phản chữ, guard crop và các viewport trang chủ. Port 3307 đã đóng, screenshot sinh trong kiểm thử đã trả về nguyên trạng.
- Typecheck riêng sau dọn include Next tạm đạt; `git diff --check` đạt, không có diff nội dung ở migration nguồn, `next-env.d.ts` hoặc `tsconfig.json`. Các thay đổi của lượt này vẫn ở working tree local, chưa commit/push.

### Release checkpoint theo yêu cầu phát hành ngày 29/09

- Người dùng đã cho phép commit, push, deploy và áp SQL hosted. Quyền triển khai không thay thế các gate an toàn dưới đây.
- Sau fetch: `origin/main=cd98e3f`, candidate HEAD trước checkpoint `8c31199`; nhánh làm việc `codex/cancellation-local`. Chỉ xuất bản checkpoint feature branch, chưa merge main.
- Kiểm tra hosted chỉ đọc lúc 08:47 UTC: tài khoản `postgres` không có `auth USAGE WITH GRANT OPTION`; role `localens_identity_rpc_owner` tồn tại, không superuser/login/bypassrls, nhưng cũng không có `auth USAGE`. Cả hai nhánh prerequisite của migration `20260929020000` đều không đạt. Không bỏ guard hoặc tự mở rộng quyền.
- Migration mới nhất được ghi nhận hosted: `20260926120000`. Không chạy một phần chuỗi migration vì mỗi file có transaction riêng và có thể để lại trạng thái nâng cấp dở dang.
- Dashboard project Free báo không có project backups; chưa có bản sao lưu dữ liệu bền vững và kiểm thử khôi phục. Xuất metadata không được tính là backup dữ liệu.
- Review độc lập xác nhận các suite trình duyệt itinerary/fixed-tour/guide-assignment cũ còn lệch giao diện đã duyệt; không bỏ test để làm xanh CI. Chưa xác nhận build/runtime Production từ candidate này.
- Typecheck mới exit 0; full unit mới đang chạy riêng. Các kết quả test trước đó ở các mục trên giữ nguyên phạm vi, không được coi là kết quả fresh của checkpoint này.
- Chưa thực hiện hosted DDL, backfill, sửa dữ liệu, merge main hoặc deploy Production trong lượt release này.
