# Quyền booking demo — tiến độ local 29/09/2026

> Báo cáo tiến độ lịch sử, không phải kết quả cuối. Xem `cancellation-permissions-final-20260929.md` để biết các sửa bổ sung và kiểm thử mới nhất.

## Phạm vi được duyệt

Người dùng cho phép bổ sung quyền liên quan trong local, giữ nguyên API/nghiệp vụ. Chưa cho phép chạy candidate này lên hosted. Không push/merge/deploy/backfill.

## Candidate chưa phát hành

`20260929030000_reviewed_rpc_permissions.sql` chuyển 10 RPC reviewed sang role NOLOGIN/NOBYPASSRLS, giữ nguyên body và chữ ký, thêm timeout; bật FORCE RLS cho hai bảng reviewed. Role chỉ đọc id/email tài khoản, không đọc mật khẩu. Policy email chỉ thấy chính chủ. Tác vụ maintenance giữ quyền EXECUTE cho postgres; browser không được gọi maintenance.

Không sửa migration lịch sử. Không đổi tiền, lịch, trạng thái đơn hoặc quy tắc hoàn tiền mô phỏng đã có. Kiểm tra trước khi áp từ chối role có thuộc tính/membership nguy hiểm hoặc một số quyền thừa; đây chưa phải chứng nhận bao phủ mọi grant ngoài đồ thị reviewed.

## Bằng chứng trong lượt này

- RED: 4/8 kiểm tra quyền ban đầu thất bại trên local baseline (owner, timeout, FORCE RLS).
- Sau sửa và mở rộng regression: 21/21 pgTAP, gồm booking -> checkout thật của prototype -> confirmed -> cancel, email lưu đúng khi auth.users bật RLS, cross-user denial, không đọc password, không sửa capacity, maintenance bằng postgres không-superuser.
- `node scripts/test-reviewed-permissions-local.mjs`: 6 nhóm đạt: áp hai lần, membership vào/ra không an toàn, grant password, grant DELETE, ownership hỗn hợp postgres/role dự kiến. Tất cả rollback.
- 91/91 test UI/adapter Hủy đạt; lint runner đạt.
- Review độc lập phát hiện membership, quyền scheduler và ownership hỗn hợp. Đã sửa các điểm này và thêm regression; không coi review snapshot cũ là chấp thuận final tree.
- Typecheck đạt. Seed inventory đã bổ sung 13 bảng; 91/91 test seed đạt khi controller chạy lại, lint đạt. Không chạy seed apply thực tế.
- Full-suite vẫn đang chạy tại thời điểm cập nhật báo cáo. Bộ artifact/matrix riêng còn 6 lỗi. Chưa hoàn tất đồng bộ matrix/checker lịch sử.

## Rollback và giới hạn

Local runner bỏ wrapper BEGIN/COMMIT của candidate rồi ghép vào giao dịch thử và ROLLBACK; khi psql lỗi, kết nối đóng rollback giao dịch chưa commit. Không chạy seed apply. Không thay đổi container/service khác.

Nếu sau này áp thật, cần snapshot ACL/owner/policy trước khi áp để xây rollback tương ứng; không dùng rollback dữ liệu đơn và không đổi chủ hàm về postgres mù quáng. Hiện chưa có phê duyệt hosted hoặc bằng chứng hosted tương đương.

## Việc còn lại

Hoàn tất seed inventory, matrix/parser/history security checks; kiểm thử các RPC đọc/review/moderation và các nhánh business biên; cập nhật báo cáo full suite; review toàn bộ và commit local sau khi đủ bằng chứng. Không tuyên bố toàn bộ feature hoàn thành từ 21 kiểm tra này.

## Tiếp tục: sửa công cụ kiểm tra RLS

- Checker cũ không hiểu DO/FOREACH với danh sách tên bảng literal, báo sai thiếu ENABLE/FORCE cho sáu bảng research. Đã thêm nhận diện giới hạn cho đúng dạng vòng lặp không điều kiện này; không đánh giá SQL tùy ý.
- RED/GREEN: trường hợp vòng lặp thật và `IF false`; review phát hiện chuỗi SQL nối qua newline và identifier viết hoa có thể làm nhận nhầm bảng. Đã tái hiện cả hai lỗi, thêm kiểm tra dấu phẩy bắt buộc và chỉ nhận literal lowercase. 4/4 regression đạt; lint đạt.
- Checker hiện còn 95 thông báo chi tiết thuộc nhóm lỗi nền, trong đó còn thiếu FORCE thực sự/khai báo cho `private.research_demo_revision_links`. Không tắt assertion hay whitelist lỗi để báo xanh.
- Chạy gộp Hủy UI/adapter và seed: 182/182 đạt. Build Supabase local loopback đạt, 43 trang, TypeScript build đạt. Full suite khởi động trước thay đổi parser vẫn chưa có kết quả tại thời điểm cập nhật; không dùng nó để chứng nhận final tree.

## Kết quả full suite đã nhận

Lượt `.local-permissions-suite.json` hoàn tất: 2.583/2.589 đạt, 6 lỗi (3 artifacts, 3 matrix). Lượt chạy bắt đầu trước khi sửa parser nên không chứng nhận toàn bộ cây cuối. Các regression parser đã chạy riêng 4/4; seed chạy lại 91/91 và lint đạt trước commit local riêng.

Runner reviewed đã bổ sung so sánh nội dung hàm, tham số, defaults, kiểu trả về và quyền EXECUTE của anon/authenticated trước/sau áp hai lần: đạt. 21 pgTAP và bốn trường hợp quyền thừa cùng ownership hỗn hợp đều đạt, rollback toàn bộ.

## Tiếp tục xử lý sáu gate — 29/09/2026

- Tái hiện thiếu preflight: role có SELECT ngoài đồ thị reviewed vẫn được candidate chấp nhận (hai pgTAP fail). Bổ sung từ chối quyền bảng/cột ngoài bốn bảng cần thiết và function ownership ngoài mười chữ ký đã chốt.
- Runner hiện đạt chín nhóm: áp hai lần + 21 pgTAP, bảy tình huống quyền/membership không an toàn, ownership hỗn hợp. Tất cả chạy trên container local và rollback; không thay đổi API/browser ACL.
- Các ALTER OWNER/timeout của candidate chuyển sang câu lệnh tường minh, giữ bước kiểm tra chủ sở hữu trước khi chuyển. Không thay đổi migration lịch sử.
- Bộ kiểm tra timeout nay xét trạng thái cuối của từng chữ ký, nhận ALTER tường minh, vẫn báo khi replacement/reset tiếp theo bỏ timeout. Controller chạy lại 20 regression: đạt. Không nhận SQL động trong DO làm bằng chứng.
- Hai file gate tổng hợp vẫn 49 đạt / 6 lỗi trong lần chạy `.local-permissions-final-gates.json`; không tuyên bố đã hoàn tất sáu lỗi. Chưa chạy lại toàn bộ suite sau các thay đổi mới.
- Đang xin chốt chính sách checker: thay yêu cầu cũ cấm mọi auth access bằng kiểm tra quyền cuối có giới hạn, phù hợp runtime đọc email chính chủ; không tự tắt gate hoặc sửa lịch sử SQL. Các quyền definer khác và đồng bộ manifest vẫn cần hoàn thiện trước khi chứng nhận toàn nhánh.
- Không push, merge, deploy, áp SQL hosted hoặc sửa dữ liệu thật.

## Chính sách Auth được duyệt và triển khai

Người dùng đã đồng ý kiểm tra quyền cuối cùng thay vì cấm mọi tham chiếu Auth. Không xem việc phê duyệt này là quyền áp database hosted.

- `checkAuthBoundary` kiểm tra các grant cuối: reviewed chỉ SELECT(id,email), identity chỉ SELECT(id,banned_until), hai role được EXECUTE auth.uid. Các schema USAGE đã có được giữ, không đồng nghĩa quyền đọc bảng.
- Từ chối quyền đọc cả auth.users, password, DML, browser read, CREATE schema, hàm Auth ngoài danh sách và WITH GRANT OPTION. Dạng Auth identifier có dấu nháy chưa được hỗ trợ được từ chối thay vì bỏ lọt.
- Bộ pgTAP reviewed nâng lên 24, bổ sung kiểm tra trực tiếp bằng role bounded: thấy email chính chủ, không thấy tài khoản khác, không UPDATE email. Runner chín nhóm đạt và rollback toàn bộ.
- Không thay API, giao diện, dữ liệu hosted hoặc migration lịch sử. Gate Auth thay đổi không có nghĩa các gate lịch sử/manifest/definer khác đã đạt.
- Review độc lập phát hiện ba điểm P2: grant Auth trong khối SQL, cú pháp ROUTINE và thu hồi grant option theo từng cột. Đã tái hiện cả ba bằng test thất bại, sửa và chạy lại 14/14 kiểm tra Auth đạt. Lệnh grant trong khối được kiểm tra bảo thủ, không được coi là bằng chứng đã áp dụng; SQL động tùy ý vẫn cần xác nhận bằng database local.
- Lượt gate trước fix review: 80/85 đạt, còn 5 lỗi: khôi phục session role, identity gate tổng, matrix drift tổng, CRLF gate phụ thuộc baseline, kiểm kê exact surface. Không đổi các assertion này để báo xanh.
- Full suite `.local-auth-boundary-suite.json`: 2.618/2.623 đạt, còn đúng năm lỗi nêu trên. Suite bắt đầu trước fix review cuối nên không chứng nhận frozen final tree; regression Auth 14/14 được chạy lại sau fix. Lint file sửa và diff check đạt. Không commit ứng viên khi gate tổng còn đỏ.
- Sau fix review, chạy lại ba file SQL gate trên cây cuối: 83/88 đạt, còn đúng năm lỗi nền đã liệt kê (`.local-auth-boundary-final-gates.json`). Runner database chạy lại đạt cả chín nhóm/24 pgTAP, rollback.
