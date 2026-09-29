# Hủy đơn — bản sửa local ngày 29/09/2026

## Phạm vi

- Nhánh `codex/cancellation-local`, gốc `cd98e3feddb430cb1685ed54982ff89d4fcdcbd2`.
- Chỉ commit local. Không push, merge, deploy, áp migration hosted hoặc backfill dữ liệu thật.
- Giữ bố cục đã duyệt và các adapter/RPC hiện có. Không bổ sung hoàn tiền tự động.
- Đã đọc Word `030239230281_PhamThiTuUyen.docx`, mục 4.1.9 và UC Hủy đơn: đơn chờ thanh toán cần còn hạn, chưa trả tiền và không có giao dịch đang xử lý/xác minh; đơn xác nhận cần còn ít nhất 48 giờ. Khách chỉ hủy đơn của mình. Tour cố định giải phóng chỗ; tour cá nhân hóa không giải phóng chỗ lịch khởi hành.

## Lỗi tái hiện và sửa

1. Hộp Hủy cá nhân hóa đang mở bỏ qua cờ bận từ trang cha. Chặn cả nút xác nhận và handler khi trang cha bận.
2. Hủy cá nhân hóa không kiểm tra lại đồng hồ ở thời điểm xác nhận. Kiểm tra lại ngay khi bấm; nếu đã hết hạn thì không gửi yêu cầu mới, vẫn cho Quay lại. Lần thử lại có khóa chống lặp vẫn được gửi để máy chủ trả kết quả có thẩm quyền sau lỗi mạng.
3. Hủy tour cố định báo thành công với bất kỳ phản hồi RPC nào. Chỉ thông báo thành công khi phản hồi có đúng ID và trạng thái `cancelled`; phản hồi rỗng, sai ID hoặc chưa hủy giữ hộp thoại và báo lỗi.

Đã chạy RED trước khi sửa: 2 test cá nhân hóa và 3 trường hợp phản hồi tour cố định thất bại đúng nguyên nhân. Sau sửa cả 5 đạt.

## Kiểm chứng

- 90/90 test trọng tâm, 6 file: hai hộp Hủy, checkout cá nhân hóa, policy, adapter research và adapter cancellation. Có kiểm tra thử lại cùng khóa sau khi hết hạn và khôi phục kết quả Hủy từ máy chủ.
- Typecheck đạt; lint bốn file sửa đạt; build Supabase-mode đạt, 43 trang. Build dùng URL loopback, không kết nối hosted.
- Research pgTAP: 123/123, rollback giao dịch kiểm thử.
- Research integration: nâng cấp/rerun hai lần giữ nguyên trường dữ liệu cũ; kiểm tra deadline và quyền đạt, bao gồm 82 kiểm tra quyền; DDL/dữ liệu được rollback và đối chiếu sau rollback.
- Research concurrency: 7/7, gồm Hủy trước, thanh toán trước ở 47h/49h, cùng/khác khóa, xung đột khóa giữa hai đơn, hết hạn trong khi đợi khóa. Dữ liệu tổng hợp được giữ trên database local phục vụ kiểm tra.
- Public booking cancellation: 94/94 trên container local `supabase_db_localens-cancellation-clean-final`; test và extension pgTAP được tạo trong giao dịch rồi rollback. Đây không phải bằng chứng cho RPC reviewed-demo đang chạy hosted.
- Bộ test toàn repo: 2.578/2.588 đạt, 10 lỗi; không tuyên bố toàn bộ đạt. Có bổ sung test trong lúc lượt toàn repo đang chạy; bộ 90 test trọng tâm chạy riêng sau sửa là bằng chứng cho bản cuối.
- Các lỗi ngoài bản vá: `registration-form.test.tsx` (focus khi email trùng); `artifacts.test.ts` (RESET ROLE, auth.uid, identity contract); `rls-matrix.test.ts` (drift gate, CRLF gate, danh mục 96 thay vì 86); `thesis-demo-cloud-seed.test.ts` (table inventory, count/classification arms, transactional v1 upgrade). Không sửa hoặc tắt các kiểm tra này. Không có SQL/manifest nào bị sửa trong bản vá.
- Review độc lập bốn file code/test: không phát hiện blocker; đã đối chiếu luồng parent checkout, khóa thử lại và thứ tự kiểm tra replay ở RPC. Reviewer không chạy test thay controller.
- Chạy lại riêng form đăng ký: 4/4 đạt; lỗi focus không tái hiện ở lượt riêng, không xem đó là bằng chứng bộ toàn repo đã xanh.

## Giới hạn

SQL được kiểm thử trên các project local riêng đã có: `D:/LocalLensSqlAudit/20260928-research-baseline` và container clean-final. Không sửa SQL trong bản vá này. Không chứng nhận tương đương giữa SQL local và hosted, không chạy thao tác Hủy thật trên website chính, không chứng nhận E2E trình duyệt của bản sửa mới. Luồng chưa cài RPC hosted vẫn phải báo chưa sẵn sàng, không giả thành công.

Các nhánh/worktree recovery cũ được giữ nguyên. Báo cáo này không phải phê duyệt migration Production.
