# LocalLens — thiết kế bản demo đồ án công khai

**Ngày:** 2026-09-04

**Trạng thái:** Đã thống nhất hướng kiến trúc; chờ duyệt đặc tả trước khi lập kế hoạch triển khai

**Mục tiêu:** Hoàn thiện và phát hành LocalLens thành một website full-stack dùng được để trình diễn, có gọi AI thật nhưng thanh toán chỉ là mô phỏng.

## 1. Đích hoàn thành

LocalLens được xem là hoàn thành cho đợt này khi có một URL công khai ổn định trên Vercel, kết nối với một dự án Supabase Cloud riêng cho bản demo, và toàn bộ luồng bảo vệ đồ án chạy được trên dữ liệu thử nghiệm:

1. Khách truy cập xem trang giới thiệu, địa điểm và tour mà không cần đăng nhập.
2. Người trình diễn đăng nhập bằng tài khoản demo theo từng vai trò.
3. Khách hàng tạo lịch trình bằng AI, xem lý do đề xuất và tinh chỉnh lịch trình.
4. Khách hàng đặt tour cố định hoặc tiếp tục luồng lịch trình cá nhân hóa.
5. Khách hàng hoàn tất “thanh toán mô phỏng”; hệ thống không thu tiền thật và không gọi cổng thanh toán thật.
6. Khách hàng có thể hủy đơn hợp lệ trước khi thanh toán; hệ thống xử lý đúng xung đột hủy/thanh toán.
7. Quản trị viên và hướng dẫn viên trình diễn được các màn hình nghiệp vụ thuộc quyền của mình.
8. AI, xác thực, phân quyền, cơ sở dữ liệu, Edge Function và giao diện đều được kiểm thử trên đúng mã nguồn đã triển khai.

Đây là **production-like thesis demo**, không phải hệ thống thương mại sẵn sàng phục vụ khách hàng thật. Nhãn nghiệm thu cuối cùng là `thesis-demo-deployed@<SHA>`, không dùng nhãn `production-deployed`.

## 2. Phạm vi đã chốt

### 2.1 Trong phạm vi

- Repository GitHub riêng tư.
- Frontend Next.js hiện tại được triển khai trên Vercel ở chế độ Supabase runtime.
- Supabase Cloud cung cấp Auth, PostgreSQL, RLS, RPC và Edge Functions.
- Gemini API được gọi thật từ Edge Function, sử dụng khóa bí mật phía server.
- Mô hình AI được ghim bằng tên ổn định `gemini-3.6-flash`, không dùng bí danh `latest`.
- Kết quả AI chỉ xếp hạng các ứng viên đã được mã nguồn và cơ sở dữ liệu cho phép.
- Engine xác định hiện tại tiếp tục chịu trách nhiệm về lịch, thời lượng, tiền, tính hợp lệ và phương án dự phòng.
- Thanh toán được mô phỏng toàn bộ ở backend bằng RPC và dữ liệu biên nhận thử nghiệm hiện có.
- Website dùng dữ liệu và tài khoản thử nghiệm, kèm thông báo rõ đây là bản demo đồ án.
- Giao diện Việt/Anh, responsive và accessible trên các viewport nghiệm thu.
- Có bằng chứng kiểm thử, release SHA, cấu hình triển khai và hướng dẫn rollback.

### 2.2 Ngoài phạm vi

- Thu tiền thật, Stripe live mode, hoàn tiền thật hoặc đối soát ngân hàng.
- Đăng ký công khai cho người dùng thật hoặc lưu PII khách hàng thật.
- Xuất bản danh mục địa điểm như dữ liệu thương mại đã được đối tác xác nhận.
- Tên miền riêng, chiến dịch marketing, analytics quảng cáo hoặc email/SMS production.
- Tích hợp bản đồ, geocoding hoặc nhà cung cấp dữ liệu ngoài mới.
- Cam kết SLA, hỗ trợ vận hành 24/7 hoặc chứng nhận tuân thủ cho sản phẩm thương mại.

## 3. Quan hệ với các đặc tả trước

Tài liệu này **chỉ thay thế** điều khoản “không thêm provider AI bên ngoài” trong đặc tả runtime ngày 2026-09-01 đối với bản demo đồ án công khai. Các bất biến an toàn trước đó vẫn được giữ nguyên:

- dữ liệu đầu vào cho AI phải được chuẩn hóa và giới hạn;
- AI không quyết định tiền, quyền truy cập, trạng thái thanh toán hoặc trạng thái đặt tour;
- mọi ID do AI trả về phải nằm trong allowlist đã gửi;
- kết quả không hợp lệ, lỗi mạng, timeout hoặc hết hạn mức phải chuyển sang engine xác định;
- RLS và RPC trong cơ sở dữ liệu vẫn là ranh giới thẩm quyền cuối cùng.

## 4. Kiến trúc đích

```text
Trình duyệt
  -> Next.js trên Vercel (NEXT_PUBLIC_LOCALLENS_RUNTIME=supabase)
     -> Supabase Auth
     -> Supabase PostgreSQL + RLS + RPC
     -> Supabase Edge Function
        -> xác thực JWT + CORS + quota
        -> tải candidate/snapshot chuẩn từ PostgreSQL
        -> Gemini API (khóa bí mật phía server)
        -> kiểm tra response nghiêm ngặt
        -> engine xác định / fallback
        -> lưu kết quả đã hợp lệ và metadata an toàn
```

### 4.1 Thành phần triển khai

Các entrypoint và adapter cần được bổ sung ở bước triển khai:

- `supabase/functions/recommend-itinerary/index.ts`: endpoint tạo đề xuất.
- `supabase/functions/refine-itinerary/index.ts`: endpoint tinh chỉnh đề xuất.
- `supabase/functions/_shared/gemini-ranker.ts`: ánh xạ hợp đồng xếp hạng sang Gemini REST API và parse structured output.
- `supabase/functions/_shared/supabase-itinerary-adapter.ts`: xác thực chủ thể, đọc snapshot/candidate chuẩn, tiêu thụ quota nguyên tử và lưu kết quả.
- Cấu hình dùng chung cho model, timeout, CORS, logging và request correlation.

Tên file có thể được điều chỉnh trong kế hoạch triển khai nếu cấu trúc hiện tại yêu cầu, nhưng ranh giới trách nhiệm trên không thay đổi.

### 4.2 Vì sao gọi Gemini từ Supabase Edge Function

- Khóa Gemini không xuất hiện trong bundle trình duyệt hoặc biến `NEXT_PUBLIC_*`.
- Việc xác thực JWT, quota, đọc dữ liệu chuẩn và gọi provider nằm cùng một trust boundary.
- Vercel chỉ phục vụ ứng dụng web; không cần tạo thêm một API bí mật song song trong Next.js.
- Có thể triển khai và rollback AI độc lập với frontend.

## 5. Luồng AI

### 5.1 Tạo lịch trình

1. Người dùng đăng nhập bằng tài khoản khách hàng demo.
2. Trình duyệt gửi các lựa chọn có cấu trúc như khu vực, loại trải nghiệm, nhịp độ và thời gian; không gửi PII.
3. Edge Function xác thực JWT, origin và kích thước request.
4. Adapter tải snapshot và danh sách candidate hợp lệ từ Supabase theo quyền hiện tại.
5. Quota được tiêu thụ nguyên tử trước khi gọi provider nhằm tránh vượt hạn mức do request đồng thời.
6. Gemini chỉ nhận ID nội bộ, thuộc tính có cấu trúc, trọng số ưu tiên và allowlist cần thiết.
7. Gemini trả structured JSON theo hợp đồng `RankResponse`.
8. Server kiểm tra schema, tập ID, độ dài rationale và lựa chọn món ăn.
9. Engine xác định xây lịch, tính thời gian/chi phí và kiểm tra toàn bộ bất biến nghiệp vụ.
10. Kết quả hợp lệ được lưu; UI hiển thị lịch trình và lý do đề xuất.

### 5.2 Tinh chỉnh lịch trình

Tinh chỉnh dùng cùng ranh giới an toàn. Yêu cầu của người dùng được chuyển thành các ràng buộc có cấu trúc trước khi gọi provider. Không chuyển nguyên văn ghi chú nhạy cảm hoặc trường “yêu cầu đặc biệt” sang Gemini. Kết quả mới phải qua cùng bộ kiểm tra và được gắn với đúng chủ sở hữu lịch trình.

### 5.3 Structured output và fallback

- Request đặt schema JSON rõ ràng và nhiệt độ phù hợp với tác vụ xếp hạng.
- Server vẫn phải kiểm tra ngữ nghĩa; structured output không thay thế validation.
- Timeout provider giữ giới hạn 8 giây của engine hiện tại hoặc ngắn hơn nếu thử nghiệm cho thấy phù hợp.
- Các trường hợp timeout, 429, 5xx, JSON lỗi, ID ngoài allowlist hoặc response không đầy đủ đều trả lịch trình xác định.
- UI phải phân biệt trạng thái “AI đang xử lý”, “đã dùng AI” và “đang dùng phương án dự phòng”, nhưng không để lỗi kỹ thuật làm hỏng luồng chính.
- Không lưu raw prompt hoặc raw response. Có thể lưu model, thời gian đáp ứng, trạng thái degraded và các rationale đã qua validation để phục vụ demo/điều tra lỗi.

## 6. Xác thực và tài khoản demo

- Trang công khai và danh mục được xem ẩn danh.
- Planner có lưu dữ liệu, booking, thanh toán mô phỏng, trang tài khoản, admin và guide yêu cầu đăng nhập.
- Bản demo cloud không mở tự đăng ký công khai ở đợt phát hành đầu tiên để tránh spam và dữ liệu PII ngoài kiểm soát.
- Chuẩn bị trước tài khoản thử nghiệm cho tối thiểu ba vai trò: customer, guide và admin.
- Thông tin đăng nhập demo không hard-code trong repository. Người trình bày nhận thông tin qua kênh riêng.
- RLS phải được kiểm tra cho cả truy cập đúng quyền lẫn truy cập chéo tài khoản/vai trò.
- Chế độ demo cục bộ vẫn là phương án offline để trình bày khi mạng hoặc dịch vụ cloud gặp sự cố; nó không được dùng làm bằng chứng cho runtime cloud.

## 7. Thanh toán mô phỏng

Luồng hiện có `complete_simulated_fixed_tour_payment` là cơ sở của bản phát hành:

1. Khách hàng tạo booking hợp lệ.
2. Màn hình checkout hiển thị rõ “Thanh toán mô phỏng — không phát sinh giao dịch thật”.
3. Người dùng chọn phương thức minh họa và xác nhận.
4. Client gọi adapter Supabase; RPC phía server kiểm tra quyền, trạng thái và tính idempotent.
5. Cơ sở dữ liệu cập nhật trạng thái và tạo biên nhận thử nghiệm trong một giao dịch.
6. UI hiển thị biên nhận demo, không hiển thị thông tin thẻ thật và không yêu cầu nhập dữ liệu tài chính nhạy cảm.
7. Kiểm thử đồng thời phải chứng minh một booking không thể vừa được thanh toán vừa bị hủy trái với bất biến nghiệp vụ.

Không thêm Stripe hoặc bất kỳ cổng thanh toán live nào trong phạm vi này.

## 8. Trải nghiệm và Product Design

### 8.1 Nguyên tắc

- Dùng design system, token, component và bố cục hiện có; không redesign sản phẩm trước ngày demo.
- Thêm nhãn “Bản demo đồ án” ở vị trí dễ thấy nhưng không che nội dung chính.
- Tại điểm dùng AI, giải thích ngắn rằng AI hỗ trợ xếp hạng gợi ý và hệ thống có thể dùng phương án dự phòng.
- Tại checkout và biên nhận, lặp lại thông báo không thu tiền thật.
- Dữ liệu nghiên cứu/thử nghiệm phải được ghi nhãn phù hợp, không tạo cảm giác là dữ liệu thương mại đã xác nhận.

### 8.2 Trạng thái bắt buộc

- loading/skeleton khi gọi AI hoặc tải dữ liệu;
- thành công với AI;
- thành công bằng deterministic fallback;
- hết quota/rate limit với hướng dẫn thử lại hợp lý;
- lỗi mạng có retry an toàn;
- phiên đăng nhập hết hạn;
- booking không còn hợp lệ do thay đổi đồng thời;
- thanh toán mô phỏng đã hoàn tất/idempotent;
- empty state cho tài khoản chưa có lịch trình hoặc booking.

### 8.3 Luồng bảo vệ đồ án

Luồng chính khi trình bày:

`Xem website -> đăng nhập customer demo -> tạo lịch trình AI -> xem/tinh chỉnh -> đặt tour -> thanh toán mô phỏng -> xem lịch sử`

Luồng phụ để chứng minh nghiệp vụ:

- tạo booking khác và hủy trước thanh toán;
- đăng nhập admin để xem/quản lý booking và dữ liệu danh mục;
- đăng nhập guide để xem phần việc được phân công;
- ngắt hoặc vô hiệu provider trong môi trường kiểm thử để chứng minh fallback.

### 8.4 Nghiệm thu hình ảnh và khả năng truy cập

Kiểm tra tối thiểu tại:

- desktop `1440x1024`;
- tablet `768x1024`;
- mobile `390x844`.

Mỗi viewport cần kiểm tra navigation, form, trạng thái AI, checkout mô phỏng, overflow, focus nhìn thấy được, thứ tự bàn phím, tương phản, thông báo lỗi, console error và network failure. Giao diện Việt/Anh không được vỡ layout hoặc mất ngữ nghĩa thông báo demo.

## 9. Bảo mật và riêng tư

- `GEMINI_API_KEY`, Supabase service-role key và mọi secret chỉ được đặt trong Supabase secrets hoặc secret store của nền tảng phù hợp; tuyệt đối không dùng tiền tố `NEXT_PUBLIC_`.
- Edge Function xác thực JWT của người dùng; service role chỉ tồn tại ở server.
- CORS chỉ cho phép đúng production origin và preview origin được phê duyệt, không mặc định `*` cho endpoint có xác thực.
- RLS tiếp tục bảo vệ dữ liệu theo người dùng/vai trò; Edge Function không được biến thành đường vòng bỏ qua thẩm quyền.
- Payload được giới hạn kích thước, kiểu dữ liệu, candidate count và thời gian xử lý.
- Log phải loại bỏ token, secret, email, số điện thoại, nội dung đặc biệt và raw prompt/response.
- Request có correlation ID không chứa thông tin người dùng để truy vết lỗi.
- AI không nhận dữ liệu thanh toán, auth identifier, email, số điện thoại hoặc văn bản tự do nhạy cảm.
- Với dữ liệu gửi tới Gemini free tier, chỉ sử dụng dữ liệu demo không nhạy cảm và ID nội bộ đã giảm thiểu.
- RPC thanh toán và booking phải giữ idempotency, kiểm tra trạng thái và khóa/xử lý cạnh tranh ở tầng cơ sở dữ liệu.

## 10. Môi trường và cấu hình

### 10.1 Local demo

- `NEXT_PUBLIC_LOCALLENS_RUNTIME=demo`.
- Không cần cloud hoặc Gemini.
- Dùng cho fallback thuyết trình offline và kiểm thử UI xác định.

### 10.2 Local Supabase runtime

- `NEXT_PUBLIC_LOCALLENS_RUNTIME=supabase`.
- Supabase chạy cục bộ, migrations/pgTAP/concurrency đầy đủ.
- Gemini adapter được mock mặc định trong CI; có thể dùng secret cục bộ do người dùng tự đặt để smoke test thủ công.

### 10.3 Cloud thesis demo

- Vercel chạy Next.js ở `supabase` runtime.
- Supabase Cloud chứa schema, tài khoản và dữ liệu demo riêng.
- Edge Functions giữ Gemini secret và model config.
- Không tái sử dụng project/database có dữ liệu thật.

Các biến public dự kiến:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_LOCALLENS_RUNTIME=supabase`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` chỉ khi Turnstile thực sự được bật trong phạm vi được duyệt.

Các secret phía server dự kiến:

- `GEMINI_API_KEY`
- Supabase service-role secret do nền tảng cấp
- origin allowlist và model name nếu không dùng giá trị mặc định đã ghim

## 11. Chiến lược kiểm thử

### 11.1 Unit và contract

- ánh xạ `RankRequest` sang payload Gemini;
- parse structured JSON thành `RankResponse`;
- từ chối ID ngoài allowlist, duplicate, thiếu ID và rationale quá dài;
- timeout/429/5xx/malformed JSON đều kích hoạt fallback;
- model config không chấp nhận alias không ghim;
- log sanitizer không làm rò rỉ prompt, secret hoặc token.

### 11.2 Edge Function

- JWT thiếu/sai/hết hạn;
- origin không hợp lệ;
- owner đúng và truy cập chéo owner;
- quota tuần tự và đồng thời;
- payload quá lớn/candidate quá nhiều;
- provider success, timeout, 429, 5xx và schema sai;
- persistence chỉ xảy ra sau validation;
- refinement không chuyển free-text nhạy cảm sang provider.

### 11.3 Database và runtime

- migration sạch trên Supabase local;
- pgTAP, RLS, schema drift, lint/types và concurrency;
- auth runtime, booking, cancel, guide assignment và simulated payment;
- kiểm tra idempotency và xung đột payment-versus-cancel.

### 11.4 Browser/E2E

- CI dùng provider giả lập xác định để tránh flake và tiêu tốn quota.
- Staging có một smoke test provider thật, giới hạn số lần gọi và không ghi secret vào artifact.
- Chạy toàn bộ luồng customer/admin/guide trên browser người dùng chấp thuận.
- Lưu screenshot, console/network summary và release SHA làm bằng chứng nghiệm thu.

## 12. Quy trình phát hành

1. Chốt đặc tả này và lập implementation plan theo từng checkpoint.
2. Tách release SHA khỏi các thay đổi không liên quan trong worktree; không reset hoặc làm mất công việc hiện có.
3. Hoàn thiện AI Edge Functions theo TDD, sau đó chạy các gate local hiện có.
4. Người dùng xác nhận chính xác owner/tên repository; tạo repository GitHub private và push release branch.
5. Tạo Supabase Cloud project riêng cho thesis demo; link CLI, kiểm tra migration diff rồi mới push migration.
6. Người dùng nhập `GEMINI_API_KEY` trực tiếp vào secret UI/CLI an toàn; không gửi secret qua chat hoặc commit.
7. Deploy Edge Functions, seed tài khoản/dữ liệu demo và chạy smoke test runtime cloud.
8. Import repository vào Vercel, đặt biến môi trường, deploy preview ở Supabase mode.
9. Chạy browser acceptance trên preview; sửa lỗi rồi khóa release SHA.
10. Promote đúng artifact/SHA sang production URL `*.vercel.app`.
11. Chạy production smoke test không phá dữ liệu và ghi bằng chứng `thesis-demo-deployed@<SHA>`.

Không tạo custom domain trong phạm vi này. Không coi URL preview hoặc HTTP 200 đơn lẻ là nghiệm thu hoàn tất.

## 13. Rollback

- **Frontend:** rollback Vercel về deployment tốt gần nhất có SHA đã ghi nhận.
- **Edge Functions:** redeploy version tốt gần nhất; giữ model/secret tương thích.
- **Database:** migration theo hướng forward-only; mọi thay đổi phá vỡ phải có migration sửa chữa, không reset remote database.
- **AI:** có kill switch cấu hình để bỏ qua Gemini và dùng deterministic fallback ngay lập tức.
- **Dữ liệu demo:** seed phải idempotent hoặc có hướng dẫn khôi phục rõ, không dựa vào thao tác xóa thủ công diện rộng.

## 14. Cổng GO/NO-GO

| Cổng | GO khi | NO-GO khi |
| --- | --- | --- |
| Mã nguồn | Release SHA sạch, CI xanh, artifact xác định được | Không biết chính xác SHA hoặc lẫn thay đổi ngoài phạm vi |
| AI | Provider thật chạy ở staging, output được validate, fallback đã chứng minh | Secret lộ ở client/log, AI có thể trả ID ngoài allowlist, không có fallback |
| Thanh toán | Chỉ mô phỏng, idempotent, không thu thập dữ liệu tài chính | Có lời gọi live hoặc UI khiến người dùng tưởng đã trả tiền thật |
| Auth/RLS | Vai trò đúng quyền, truy cập chéo bị chặn | Service role lọt client hoặc endpoint bỏ qua RLS/thẩm quyền |
| UX | Luồng chính chạy ở 3 viewport, keyboard/console/network đạt | Vỡ layout, CTA chính không hoạt động hoặc trạng thái lỗi không rõ |
| Cloud | Supabase/Vercel đúng môi trường, migrations/functions đồng bộ | Dùng nhầm project, thiếu env hoặc chỉ kiểm tra HTTP 200 |
| Rollback | Đã biết deployment/function tốt gần nhất và có AI kill switch | Không có đường lui an toàn |

## 15. Bằng chứng và nhãn trạng thái

- `demo-verified@<SHA>`: chế độ demo cục bộ và E2E xác định đạt.
- `runtime-verified-local@<SHA>`: Supabase local, RLS, pgTAP, concurrency và runtime E2E đạt.
- `thesis-demo-deployed@<SHA>`: preview/production Vercel + Supabase Cloud + AI thật + simulated payment đã được nghiệm thu.
- Không sử dụng `production-deployed` vì chưa có thanh toán thật, vận hành thương mại, dữ liệu thật và các cổng tuân thủ tương ứng.

Mỗi nhãn phải đi cùng ngày chạy, lệnh/gate, commit SHA, môi trường, kết quả và liên kết artifact/screenshot phù hợp.

## 16. Phần người dùng cần thực hiện hoặc xác nhận

Codex có thể làm phần lớn công việc kỹ thuật: code, test, migration, CI, cấu hình dự kiến, seed demo, kiểm tra browser, tài liệu triển khai và hỗ trợ deploy. Các điểm sau cần chủ dự án trực tiếp xác nhận hoặc thao tác vì liên quan tài khoản/secret:

1. Xác nhận owner và tên repository GitHub private trước khi tạo/push.
2. Đăng nhập hoặc ủy quyền Vercel và Supabase nếu CLI/UI yêu cầu.
3. Tạo Gemini API key trong Google AI Studio và nhập trực tiếp vào Supabase secret store; không gửi key trong chat.
4. Chấp thuận việc điều khiển browser/Playwright khi bắt đầu vòng nghiệm thu trực quan theo quy tắc Product Design.
5. Kiểm tra URL cuối cùng và xác nhận bản demo đáp ứng kịch bản bảo vệ đồ án.

## 17. Rủi ro chính và giảm thiểu

- **Gemini thay đổi model/API hoặc quota:** ghim model ổn định, contract test, timeout ngắn, quota cục bộ và deterministic fallback.
- **Free tier không ổn định:** giới hạn smoke test thật, CI dùng mock, có kill switch và demo offline.
- **Rò rỉ secret/PII:** server-only secret, payload tối thiểu, log redaction, không public signup và chỉ dùng dữ liệu thử nghiệm.
- **Schema cloud lệch local:** kiểm tra migration history/diff trước push và chạy smoke test sau deploy.
- **Worktree hiện có nhiều thay đổi:** chỉ stage file đúng phạm vi, ghi release SHA rõ và không reset/stash công việc của người dùng.
- **Người xem hiểu nhầm payment/AI:** nhãn demo nhất quán ở landing, planner, checkout và receipt.
- **Mạng lỗi ngày bảo vệ:** giữ local demo đã kiểm chứng và kịch bản fallback không phụ thuộc provider.

## 18. Definition of Done

Đợt này hoàn thành khi toàn bộ điều kiện sau đồng thời đúng:

- code AI provider và Edge Function đã được review, test và không chứa secret;
- tất cả gate local liên quan đạt trên cùng release SHA;
- Supabase Cloud có schema/functions/seeds đúng phiên bản;
- Gemini thật tạo được ít nhất một lịch trình staging hợp lệ và fallback được chứng minh;
- booking, hủy và simulated payment đạt runtime test;
- browser acceptance đạt ở desktop, tablet và mobile cho Việt/Anh;
- GitHub private, Vercel production URL và Supabase project trỏ đúng release;
- thông báo “demo đồ án”, AI và thanh toán mô phỏng hiển thị rõ;
- có hướng dẫn tài khoản demo, triển khai, vận hành tối thiểu và rollback;
- người dùng xác nhận URL cuối cùng sẵn sàng cho buổi bảo vệ.

## 19. Tài liệu nền tảng tham chiếu

- Gemini model lifecycle và tên model: <https://ai.google.dev/gemini-api/docs/models>
- Gemini deprecations: <https://ai.google.dev/gemini-api/docs/deprecations>
- Gemini structured output: <https://ai.google.dev/gemini-api/docs/structured-output>
- Gemini pricing/free tier: <https://ai.google.dev/gemini-api/docs/pricing>
- Gemini rate limits: <https://ai.google.dev/gemini-api/docs/rate-limits>
- Supabase Edge Function deployment: <https://supabase.com/docs/guides/functions/deploy>
- Supabase secrets: <https://supabase.com/docs/reference/cli/supabase-secrets>
- Vercel với Next.js: <https://vercel.com/docs/frameworks/full-stack/nextjs>
