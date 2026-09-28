# Hủy đơn cá nhân hóa — thiết kế đã chốt để duyệt

## Mục tiêu và giới hạn

Hoàn thiện Hủy đơn cho luồng `research_demo` website đồ án đang sử dụng. Giữ giao diện đã duyệt và các nghiệp vụ khác; không chuyển đơn sang `public.bookings`, không tạo luồng thanh toán song song. Người dùng đã duyệt thiết kế trong hội thoại; tài liệu này cần được duyệt trước khi lập kế hoạch thực hiện.

Chỉ triển khai và kiểm thử trên local. Không áp SQL lên Supabase thật, backfill, sửa dữ liệu thật, merge main hay deploy. Không xóa worktree/nhánh recovery. Không tự động hoàn tiền hoặc bổ sung nhà cung cấp thanh toán.

## Hiện trạng đã xác minh

- Hai adapter `research-demo-adapter.ts` và `research-request-adapter.ts` gọi `research_demo_booking` / `research_demo_checkout`.
- Các kiểu và bộ kiểm tra dữ liệu hiện chỉ nhận `pending_payment`, `confirmed`, `expired`.
- Mã SQL gốc được tìm thấy trong worktree `localens-guide-release`, migration `20260924180000_research_quote_checkout.sql`. Bảng là `private.research_demo_bookings`; không phải `public.bookings`.
- Bộ migrations nhánh tổng hiện chưa có các RPC này. Không xem việc dựng thành công 46 migrations hiện tại là đã dựng được luồng research. Phải lập danh sách đầy đủ phụ thuộc từ nguồn cũ để dựng local; không sao chép/merge nguyên nhánh cũ.
- Chưa xác minh định nghĩa đang chạy trên hosted có hoàn toàn trùng mã nguồn tìm được. Đây là điều kiện phải giải quyết trước một lần duyệt triển khai thật sau này.

## Quy tắc nghiệp vụ

1. Chỉ khách sở hữu đơn được hủy; xác thực và phân quyền thực hiện lại trên máy chủ.
2. Đơn `pending_payment` chỉ hủy khi còn trước `expires_at` đã lưu, thanh toán ở trạng thái `pending` hoặc `failed`. Không gia hạn hay viết lại deadline của đơn cũ. Ở luồng research, `pending` là chưa thanh toán, không đồng nhất với giao dịch đang xử lý ở luồng khác.
3. Đơn `confirmed` phải có thanh toán `paid`, còn ít nhất 48 giờ trước thời điểm bắt đầu trong revision đã gắn với đơn. Không dùng revision mới nhất có thể đã thay đổi. Bằng đúng 48 giờ được phép; ít hơn không được phép.
4. Mốc thời gian do máy chủ quyết định, đọc sau khi lấy khóa. Thiếu hoặc không hợp lệ dữ liệu thời gian thì từ chối an toàn.
5. Đơn hết hạn hoặc trạng thái không hợp lệ không được hủy. Đơn đã hủy trả lại kết quả hiện có, không tạo thêm lịch sử.
6. Hủy thay đổi trạng thái đơn thành `cancelled`, giữ nguyên số tiền, thông tin thanh toán và `paid_at` nếu đã trả tiền. Không biểu diễn thành đã hoàn tiền.
7. Không sửa trạng thái duyệt yêu cầu, revision, deadline báo giá hoặc mở lại khả năng đặt cùng báo giá. Không có nghiệp vụ giữ chỗ tour cố định trong luồng này.

## Hợp đồng và lưu trữ

- Bổ sung `cancelled` vào trạng thái đơn research; thêm thông tin hủy trả về cho giao diện, tương thích với các đơn cũ không có thông tin hủy.
- RPC Hủy riêng cho research nhận mã đơn và khóa chống gửi lặp; kiểm tra chủ sở hữu trước cả nhánh trả lại kết quả cũ. Không dùng `public.cancel_booking` cho ID research.
- Lưu một bản ghi hủy bất biến cho mỗi đơn: mã đơn, người hủy, thời điểm, khóa yêu cầu, trạng thái trước khi hủy. Ràng buộc duy nhất theo đơn; không cho trình duyệt ghi trực tiếp. Không chứa thông tin hành khách không cần thiết.
- Trạng thái và lịch sử hủy phải ghi trong cùng giao dịch: một phần lỗi thì không ghi phần còn lại. Nếu cùng khóa được dùng cho đơn khác thì trả xung đột.
- Schema/SQL bổ sung được giữ riêng, chỉ áp local. Không sửa migration Hủy `public.bookings` để biến nó thành luồng research.

## Đồng thời với thanh toán

Tái sử dụng RPC thanh toán research hiện có. Cả Hủy và Thanh toán phải dùng cùng thứ tự khóa trên yêu cầu/đơn, đồng thời kiểm tra lại trạng thái sau khóa. Chỉ sửa phạm vi cần thiết, giữ payload và kết quả thanh toán hiện có.

- Hủy trước: thanh toán sau không được ghi tiền đã trả hay chuyển đơn sang confirmed.
- Thanh toán trước, còn dưới 48 giờ: đơn giữ confirmed/paid, Hủy bị từ chối.
- Thanh toán trước, còn từ 48 giờ: Hủy tiếp theo hợp lệ, đơn cuối cancelled nhưng thông tin paid được giữ; lịch sử chỉ có một lần hủy.
- Hai yêu cầu Hủy cùng lúc: một kết quả hủy, một lịch sử; các lần gửi lại nhận cùng kết quả.

Test phải gọi chính RPC research, không tự cập nhật trạng thái/biên nhận để thay thế thanh toán. Fixture cần yêu cầu đã duyệt, revision có startAt hợp lệ, báo giá và đơn đúng chuỗi nghiệp vụ.

## Giao diện và adapter

Giữ bố cục hiện tại. Trên chi tiết đơn/luồng thanh toán cá nhân hóa, thêm nút Hủy khi đủ điều kiện và hộp xác nhận có Quay lại/Xác nhận hủy. Hiển thị trạng thái Đã hủy và ẩn hành động thanh toán sau hủy. Không thêm luồng hoàn tiền.

Cập nhật cả hai adapter/kiểu dữ liệu để không loại bỏ hoặc lỗi parse trạng thái mới. Nút đang gửi phải khóa để tránh bấm lặp; lỗi mạng không được hiển thị hủy thành công. Gửi lại giữ khóa chống lặp, tải lại trạng thái máy chủ sau kết quả. Nếu RPC chưa được cài thì báo chức năng chưa sẵn sàng, không giả thành công hoặc chuyển sang local state.

## Tiêu chí kiểm chứng

- pgTAP: trước/đúng/sau hạn thanh toán; trước/đúng/sau mốc 48 giờ; sở hữu; vai trò; thiếu thời gian; đơn đã hủy; khóa lặp/xung đột; rollback; quyền/RLS.
- Đồng thời hai kết nối: Hủy trước; Thanh toán trước ở cả hai phía 48 giờ; hai Hủy đồng thời, dùng RPC thực tế và xác minh trạng thái/lịch sử cuối.
- Kiểm thử nâng cấp: dựng schema research gốc, tạo đơn cũ có dữ liệu, áp SQL mới và so sánh các dữ liệu nghiệp vụ trước/sau. Kiểm tra chạy lại SQL an toàn. Không chỉ kiểm thử schema mới trống.
- Adapter/component: nhận trạng thái cancelled, xác nhận/quay lại, lỗi mạng/gửi lại, quyền truy cập, không thanh toán lại đơn hủy, bố cục không thay đổi.
- Typecheck, lint file thay đổi, targeted tests, build; ghi riêng lỗi baseline. Không nới quyền hoặc bỏ test để làm xanh.
- Kết quả local không thay thế kiểm thử ba vai trò trên Preview sau này; không tự động cho phép phát hành.

## Điều kiện dừng và rollback

Nếu nguồn SQL thiếu phụ thuộc hoặc khác nghiệp vụ đã chốt, báo rõ trước khi tạo giải pháp thay thế. Nếu cần sửa Planner/Quote ngoài điểm khóa/kiểm tra liên quan, xin chốt phạm vi riêng.

Hosted chưa đổi nên không có rollback hosted trong giai đoạn này. Trước khi đề nghị áp thật phải có diff định nghĩa hiện hành, báo cáo tác động và phương án sửa tiến hoặc phục hồi định nghĩa phù hợp. Rollback Git/Vercel không hoàn tác database; tuyệt đối không tự xóa lịch sử hủy hay phục hồi trạng thái đơn đã phát sinh.
