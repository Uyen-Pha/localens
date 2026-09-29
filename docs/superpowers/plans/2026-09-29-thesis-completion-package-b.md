# LocalLens Package B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Hoàn thiện gói đồ án gồm website nguyên mẫu đã nghiệm thu, mã nguồn có thể bàn giao, tài liệu nhất quán và kịch bản bảo vệ.

**Architecture:** Giữ giao diện đã duyệt và phân chia Supabase/demo hiện có. Đây là kế hoạch điều phối nghiệm thu, không thiết kế thêm hệ thống. Lỗi được chứng minh mới có kế hoạch sửa nhỏ riêng, test hồi quy và review trước khi tích hợp.

**Tech Stack:** Next.js, React, TypeScript, Supabase, Vitest, Vercel; Word là nguồn đặc tả nghiệp vụ.

**Spec:** Phương án B được người dùng chọn trong cuộc trò chuyện; Word nguồn `C:/Users/Admin/Downloads/030239230281_PhamThiTuUyen.docx`; giới hạn vận hành trong `docs/recovery/unified-prototype-acceptance.md`. Nội dung Word phải được đọc lại và trích vị trí trước khi kết luận khớp nghiệp vụ; kế hoạch này chưa chứng nhận đối chiếu Word.

## Global Constraints

- Không thiết kế lại UI, không mở rộng thành production thương mại.
- Không áp migration Hủy đơn, không seed/backfill/chỉnh đơn hiện có. Thay đổi database cần duyệt riêng.
- Không đổi màn hình demo thành Supabase hoặc đổi runtime thật thành demo.
- Giữ worktree/branch recovery và các thay đổi không thuộc nhiệm vụ.
- Không lưu mật khẩu, token, dữ liệu khách vào tài liệu/public repo.
- Chỉ phát hành bản mới sau khi người dùng nghiệm thu Preview và xác nhận phát hành.
- Bản sửa hiện ở `codex/thesis-post-release-fixes`; Preview `https://localens-keqx45evy-local-lens2.vercel.app`. Không tạo Preview mới khi chưa có thay đổi cần build.

## Review Focus

1. Ranh giới 72 giờ theo UTC+7: tạo mới/thử lại phải kiểm tra lại; xem bản cũ không bị nhầm với tạo mới.
2. Sai vai trò hoặc phiên hết hạn: không lộ nội dung, không cho thao tác vượt quyền.
3. Hết chỗ/đã khởi hành/báo giá hết hạn: UI và hành động phải nhất quán với luật đã chốt.
4. Dữ liệu mẫu khác dữ liệu thật: mô tả trung thực, không suy diễn rằng thao tác demo đã ghi database.
5. Preview khác Production hoặc lỗi mạng: có bằng chứng phiên bản, trạng thái lỗi rõ và mốc rollback.

## Task 1 — Ma trận Word / website / dữ liệu

**Files:** Create `docs/acceptance/thesis-word-runtime-matrix.md`; read Word và runtime/component liên quan. Không chỉnh Word gốc.

- [ ] Đọc các use case liên quan; ghi heading/bảng làm nguồn, tách yêu cầu với nhận xét trong tài liệu.
- [ ] Mỗi dòng ghi: actor, điều kiện trước, thao tác, kết quả, ngoại lệ, route, demo/runtime, bằng chứng, trạng thái.
- [ ] Bao phủ Khách, HDV, QTV và năm Review Focus ở trên. Mâu thuẫn luật đưa người dùng chọn trước khi sửa.
- [ ] Đầu ra được review: không đánh dấu Đạt chỉ vì màn hình tải hoặc test unit đạt.

## Task 2 — Nghiệm thu website theo vai trò

**Files:** Update `docs/acceptance/thesis-demo-scenarios.md`; evidence in `docs/reports/thesis-post-release-fixes-20260929.md`.

- [ ] Khách: hồ sơ, đủ 6 tour, đúng tour khi mở booking, danh sách và chi tiết đơn.
- [ ] Planner: câu tự nhiên, form, ngân sách không chọn khu vực, 72 giờ, tạo/chỉnh và xác nhận yêu cầu.
- [ ] Quote/booking: duyệt, báo giá, hạn hiệu lực, thanh toán mô phỏng, xem đơn, hủy theo phạm vi prototype thực tế.
- [ ] HDV: đúng tài khoản, lịch/danh sách, chi tiết, trạng thái theo giờ, điều kiện chỉnh hồ sơ.
- [ ] QTV: tổng quan/điều hướng, đơn, phân công trước giờ khởi hành, lịch chỉ tạo/xem/theo dõi/hủy, tài khoản/địa điểm/tour/báo cáo hiện có.
- [ ] Trước thao tác ghi: xác định nơi lưu, các bản ghi test, thay đổi cho phép; xin duyệt nếu chưa có. Không thử trên đơn hiện có một cách tùy tiện.
- [ ] Ghi riêng kết quả chuột/bàn phím/mobile, sai vai trò, mất kết nối và hết phiên. Không khẳng định vượt phạm vi đã thử.

## Task 3 — Xử lý lỗi có bằng chứng

**Files:** Source/test chỉ định trong từng phiếu lỗi sau khi tìm nguyên nhân; update báo cáo hiện có. Không đoán trước danh sách file cần sửa.

- [ ] Phân loại: chặn demo; sai nghiệp vụ/quyền; lỗi trình bày; lỗi test/SQL baseline.
- [ ] Mỗi lỗi: tái hiện → test đỏ → sửa tối thiểu → test xanh → review độc lập.
- [ ] Chạy targeted tests, lint file sửa, typecheck, build. Giữ riêng 9 test SQL lỗi và điều tra 2 test giao diện không ổn định, không hạ assertion để che lỗi.
- [ ] Nếu sửa source: tạo Preview mới, kiểm tra lại luồng chịu tác động; không tự thêm domain hoặc phát hành.

## Task 4 — Hồ sơ bàn giao và bảo vệ

**Files:** Update `README.md`; create `docs/hand-off/thesis-handoff.md` and `docs/defense/thesis-demo-script.md`.

- [ ] README: cài/chạy/build/test, cấu hình mẫu, vai trò, demo/runtime, giới hạn đã biết; không chứa secret.
- [ ] Bàn giao: commit, URL, bản đồ route, kết quả test, migration đã/chưa áp có bằng chứng, sao lưu/khôi phục và phần chưa nghiệm thu.
- [ ] Kịch bản bảo vệ: ba vai trò, trình tự thao tác, đầu vào, kết quả mong đợi, nhánh ngoại lệ, lời giải thích AI/thanh toán mô phỏng.
- [ ] Xác nhận ngày trình bày trước khi chọn dữ liệu có ngày giờ; không backfill để làm demo trông đúng.
- [ ] Chuẩn bị ảnh/video dự phòng khi được phép, không lộ dữ liệu nhạy cảm. Nếu cần sửa Word/slide, làm trên bản sao và xin duyệt phạm vi riêng.

## Task 5 — Duyệt và phát hành

- [ ] Người dùng nghiệm thu cùng một Preview; các lỗi chặn demo hoặc sai quyền/nghiệp vụ đã xử lý hoặc phần chưa hỗ trợ được giới hạn rõ và được chấp nhận.
- [ ] Kiểm tra đúng commit/diff, không stage file lạ, kiểm tra secret, backup main và Preview.
- [ ] Sau xác nhận phát hành: cập nhật GitHub, merge source đã duyệt, deploy đúng nguồn lên domain chính; không chạy migration.
- [ ] Smoke test 7 route và các vai trò trên Production. Khác bản đã duyệt thì rollback, không tự sửa nóng.
- [ ] Giữ nhánh/worktree recovery; bàn giao URL, commit, giới hạn và hướng dẫn trình bày.

## Execution and decisions

- PM/tích hợp: trợ lý chính giữ checklist và báo cáo Đã đạt / Chưa đạt / Chờ người dùng.
- Dev và QC chỉ chia việc độc lập khi có lỗi cụ thể; không giao nhiều người cùng sửa một file. QC không tự sửa để xác nhận công việc của chính mình.
- Người dùng cần cung cấp ngày nộp/bảo vệ, đăng nhập ba vai trò khi cần, duyệt ghi dữ liệu test và xác nhận phát hành cuối.
- Trước mắt làm Task 1–2; không khởi chạy song song toàn bộ dự án, không lặp lại các kiểm tra đã có bằng chứng nếu nguồn không đổi và kết quả còn phù hợp.
