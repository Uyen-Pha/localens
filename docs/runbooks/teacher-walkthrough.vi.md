# LocalLens — walkthrough 10 phút cho buổi bảo vệ

## Điều kiện và cách nói đúng

Walkthrough này mô tả luồng người xem sẽ thử sau khi G20/G21 được controller nghiệm thu. Ở checkpoint hiện tại, browser gate vẫn **PENDING** tại evidence `dd9aafc`; hai URL dưới đây mới là URL đã quan sát, không phải tuyên bố release đã đạt:

- Production đã quan sát: `https://localens-ashen.vercel.app`
- Preview theo branch đã quan sát: `https://localens-git-codex-thesis-release-final-local-lens2.vercel.app`

Chỉ dùng URL/candidate mà controller ghi trong acceptance sau khi reconcile SHA. Tài khoản demo và password nhận qua kênh riêng, không chép vào slide, log hay tài liệu.

Có hai luồng cần tách khi thuyết trình:

1. **Planner cá nhân hóa:** người dùng nhập nhu cầu có cấu trúc; hệ thống lấy candidate/catalog/travel/FX snapshot, engine kiểm tra lịch và chi phí, sau đó lưu proposal/revision để lock, refine và mở lại. Release dùng deterministic fallback với `provider=0`; không cần Gemini key. Đây là advisory itinerary.
2. **Fixed tour:** người dùng chọn tour đã công bố và departure còn chỗ, tạo hold/booking, thanh toán mô phỏng và xem history. Đây là luồng checkout cần hoàn tất nghiệm thu trước buổi trình bày.

Planner itinerary không được nói là đã chuyển thành booking cá nhân hóa. `/custom-request`, nếu mở trong bài demo, là request/quote review riêng theo contract; không hứa quy trình quote → booking nếu evidence chưa có.

## Kịch bản theo phút

Trước buổi thử, controller dùng **customer QA**, đọc lại các bản ghi còn trống và chuẩn bị khóa sessionStorage theo [ma trận QA](../acceptance/thesis-demo-scenarios.md): `qa-01` cho thanh toán, `qa-02` cho hủy, tối đa hai người. Các departure QA yêu cầu đúng khóa trong manifest, nên không tự chọn chuyến QA rồi dùng khóa ngẫu nhiên. Không chạy thử mutation trên tài khoản hoặc dữ liệu dành cho thầy. Hai lượt fallback `qa-03`/`qa-04` đã được dùng; không chạy lại để lấy ảnh. Planner QA dùng operation riêng với ngân sách hữu hạn. Khi trình bày, controller phải cung cấp phiên đã chuẩn bị và ghi rõ giới hạn này.

### 0:00–1:00 — Mở trang và giới thiệu phạm vi

1. Mở URL preview đã được controller xác nhận, chọn **Tiếng Việt** hoặc **English** bằng locale switcher.
2. Chỉ cho người xem home public: hero, nhu cầu chính, link catalog. Có thể mở `/vi/tours/` hoặc `/en/tours/` để cho thấy các fixed tour và thông tin departure.
3. Nói rõ: “Đây là thesis demo; dữ liệu/trạng thái được giới hạn cho demo. Payment ở đây là mô phỏng.”

Nếu URL chưa có acceptance G20, dừng phần cloud tại đây và ghi blocker; không dùng fixture/local screenshot để gọi preview PASS.

### 1:00–2:00 — Đăng nhập customer

1. Mở `/vi/sign-in/` hoặc `/en/sign-in/`.
2. Dùng customer demo account được cấp riêng; không đọc password thành tiếng và không ghi vào evidence.
3. Kiểm tra sau sign-in quay lại planner đúng locale. Nếu nhập sai, chỉ cần cho thấy thông báo generic; không trình bày token/session internals.
4. Không dùng public signup trong walkthrough.

### 2:00–4:00 — Tạo itinerary fallback deterministic

1. Mở `/vi/planner/` hoặc đường dẫn planner từ home.
2. Chọn một preset có sẵn, rồi xác nhận các input: ngày/giờ bắt đầu còn hiệu lực, duration, budget, party size, area/experience và ngôn ngữ hướng dẫn. Chỉ dùng các trường có trong form.
3. Nhấn **Generate** một lần và chờ status. Không double-click, không tự refresh trong lúc operation đang chạy.
4. Đọc proposal: các stop, thời lượng, travel, chi phí, tổng và rationales. Chỉ ra `source/degraded`/fallback disclosure nếu response hiển thị.
5. Cách nói: “Trong release này, hệ thống chứng minh đường fallback deterministic từ dữ liệu/candidate được allowlist; counter provider là `0`. Engine mới quyết định lịch, ràng buộc và tiền. Đây không phải tuyên bố Gemini live đang chạy.”

G19 protected smoke chỉ có một recommend endpoint invocation. Các thao tác refine/readback dưới đây thuộc browser QA hữu hạn của G20/G21; người chạy phải là C hoặc Luna được ủy quyền trên dataset QA.

### 4:00–6:00 — Lock, refine và mở lại revision

1. Trên một stop, nhấn **Lock**; cho người xem thấy nút đổi trạng thái pressed. Có thể mở khóa lại nếu cần.
2. Nhập một feedback ngắn thuộc các refinement signal được hỗ trợ, chọn scope phù hợp rồi nhấn **Refine** một lần.
3. Kiểm tra revision mới và xác nhận stop đã khóa vẫn còn theo contract. Không nói rằng mọi câu tiếng Việt tự do đều được hiểu.
4. Reload planner hoặc rời trang rồi quay lại. Proposal/plan pointer phải đọc lại revision mới nhất; reload không tự tạo một AI operation mới.
5. Nếu readback hoặc refine lỗi, dùng CTA retry được hiển thị và ghi actual error/evidence; không tự gọi provider hoặc lặp vô hạn.

Kết luận phần này: “Planner giúp tạo và tinh chỉnh một lịch trình advisory có revision. Nó chưa phải nút mua tour.”

### 6:00–8:00 — Chọn fixed tour, hold và payment mô phỏng

1. Mở `/vi/tours/` hoặc `/en/tours/`, chọn một tour có departure còn chỗ.
2. Mở booking route, kiểm tra title, meeting point, party size và trạng thái availability. Nhấn tạo hold một lần; chờ trạng thái authoritative.
3. Vào account bằng customer session. Chỉ ra booking, hold expiry, tổng tiền và trạng thái payment.
4. Nhấn nút **simulated payment**/hoàn tất thanh toán mô phỏng. Nhắc người xem: “Không nhập thẻ, không có charge và không gọi payment processor.”
5. Đọc receipt/booking reference do demo hiển thị. Nếu thử replay theo QA budget, dùng cùng idempotency context và xác nhận status/receipt không nhân đôi; ghi rõ đây là replay evidence.

### 8:00–9:00 — History và cancel đúng state

1. Vẫn ở account, chỉ ra booking history, payment status và thời điểm mô phỏng.
2. Với booking còn `pending_payment`, mở dialog cancel, chọn reason hợp lệ, xác nhận một lần; kiểm tra alert/status, history và idempotency.
3. Không gọi cancel cho booking đã paid. Nói rõ: “Cancel trước payment là state contract của demo; payment-vs-cancel phải giữ invariant.”
4. Kiểm tra dialog bằng bàn phím nếu đang chạy accessibility/browser case: focus vào dialog, Escape đóng dialog khi chưa submit, focus trở lại trigger.

### 9:00–9:45 — Admin và guide

1. Mở hai phiên trình duyệt riêng hoặc lần lượt logout/login bằng admin và guide demo accounts nhận qua kênh riêng.
2. Admin vào `/vi/admin/` hoặc `/en/admin/`: xem queue/booking và thao tác assign guide chỉ khi controller đã cấp QA slot. Mutation không dùng departure teacher đang thử.
3. Guide vào `/vi/guide/` hoặc `/en/guide/`: chỉ thấy tour được phân công, trường vận hành được phép và trạng thái **read-only**. Guide không thấy payment/customer PII và không có nút accept/complete nếu contract không cấp quyền đó.
4. Thử một direct entry sai role chỉ khi case E19 được ủy quyền; mong đợi access denied và không có dữ liệu role kia trong DOM/readback.

### 9:45–10:00 — Chốt với người xem

Nói ba giới hạn chính:

- Release cloud hiện dùng fallback deterministic `provider=0`; live provider là thí nghiệm tương lai tách riêng.
- Payment là mô phỏng; không thu tiền và không nhập card.
- Planner itinerary advisory không đồng nghĩa personal-trip checkout; fixed tour là luồng checkout được trình diễn.

Ghi lại URL, candidate/deployment SHA, browser/version, locale, viewport, account role, artifact và blocker. Báo cáo theo bốn mục: **outcome**, **test/evidence và reviewer**, **next gate**, **blocker**. Không dùng “19/22” hoặc phần trăm task để nói website đã hoàn thiện toàn bộ.

## Evidence refs để người thực thi đối chiếu

- Planner UI/state: `components/customer/supabase-planner-flow.tsx:302-328,413-450,462-595,627-819`; `tests/components/customer/supabase-planner-flow.test.tsx:208-236,376-418,490-558,619-873`.
- Fallback/engine: `lib/application/itinerary/recommend.ts`; `lib/domain/itinerary/engine.ts`; `tests/unit/itinerary/recommend.test.ts:403-444`; `tests/unit/supabase/recommend-itinerary-handler.test.ts:955-1050,1361-1386`.
- Fixed tour/payment/history: `components/customer/runtime-fixed-tour-booking.tsx:35-173`; `components/customer/runtime-fixed-tour-account.tsx:73-308`; `tests/components/customer/runtime-fixed-tour-account.test.tsx:249-497`; `tests/components/customer/booking-flow.test.tsx:114-264`.
- Cancel/admin/guide: `components/customer/booking-cancellation-dialog.tsx:78-167`; `components/admin/runtime-guide-assignment-queue.tsx:50-184`; `components/guide/runtime-guide-assignment-list.tsx`; `tests/components/portals/supabase-portal-surface.test.tsx:402-481`.
- Locale/routes: `app/[locale]/page.tsx:28-44`; `app/[locale]/planner/page.tsx:28-38`; `app/[locale]/tours/page.tsx:27-34`; `app/[locale]/account/page.tsx:27-35`; `app/[locale]/admin/page.tsx:27-35`; `app/[locale]/guide/page.tsx:27-35`; `tests/e2e/static-shell.spec.ts:23-44`.

Các refs trên chỉ giúp người chạy tìm contract/hành vi. Chúng không thay thế evidence cloud/browser và không tự biến walkthrough thành PASS.
