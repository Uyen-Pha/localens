# LocalLens — Integrated Luna Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Đây là bản bổ sung tích hợp vào roadmap 22 task hiện có, chưa phải lệnh thực thi.

**Goal:** Hoàn thành website demo đồ án trên Vercel + Supabase Cloud để thầy tự mở, đăng nhập và trải nghiệm hai luồng planner và đặt tour, có bằng chứng kiểm tra và đường rollback.

**Architecture:** Giữ kiến trúc và design system hiện tại. Next.js phục vụ giao diện, Supabase giữ Auth/RLS/RPC/Edge; Gemini chỉ hỗ trợ xếp hạng, engine xác định kiểm tra lịch và tiền. Tiếp nối task tổng hiện có, không khởi động một dự án hay roadmap mới.

**Tech Stack:** Next.js 16.3.2, React 19, TypeScript, pnpm 10.17.1 qua Corepack, Supabase, Vitest, Playwright; xác minh lại phiên bản từ lockfile trước thực thi. Controller/agent thực thi: **GPT-5.6 Luna / Max / Fast**. Reviewer: **GPT-6 Astra / High / Normal** theo yêu cầu cập nhật của người dùng.

**Spec:** `docs/superpowers/specs/2026-09-04-localens-public-thesis-demo-design.md` trong checkout đang triển khai, cùng các rulings trong `.superpowers/sdd/2026-09-04-localens-supabase-planner-experience/progress.md`. Phần “Phạm vi bổ sung” dưới đây là đề xuất cần được giữ cùng plan khi review.

## Global Constraints

- Nhãn phát hành là `thesis-demo-deployed@SHA`; không gọi đây là hệ thống thương mại hoàn chỉnh.
- Thanh toán mô phỏng, không thu tiền, không nhập thẻ thật; không mở đăng ký công khai cho người thật.
- AI không quyết định tiền, quyền, trạng thái booking; không nhận PII hoặc raw free text nhạy cảm.
- Chỉ dùng ID trong candidate allowlist; giữ validation, RLS, quota và deterministic fallback.
- Timeout provider tối đa 8 giây theo spec; không đổi provider/model đã ghim nếu chưa có quyết định phạm vi.
- Ba viewport bắt buộc: `1440x1024`, `768x1024`, `390x844`; kiểm tra cả Việt/Anh.
- Gemini key/service-role chỉ ở server; không đưa secret vào chat, source, artifact hoặc `NEXT_PUBLIC_*`.
- CORS chỉ đúng origin; không dùng `*` cho endpoint xác thực.
- Phạm vi release cloud đã được duyệt là `fallback-only` với `provider=0`: không yêu cầu provider thật hoặc `GEMINI_API_KEY`. `live-success` chỉ là thí nghiệm tùy chọn trong tương lai, tách khỏi G19/G20/G21/G22 và phải có opt-in, budget và evidence riêng.
- Sau mỗi bước hoàn thành, báo người dùng bốn mục: outcome, test/evidence và reviewer, next gate. Không dùng số task hoặc phần trăm task như tỷ lệ hoàn thành sản phẩm.
- Không reset/stash/discard dữ liệu/công việc cũ. Không reset DB cloud; không seed DB thuyết trình, DB có dữ liệu ngoài demo hoặc cloud target chưa xác minh. Chỉ seeder guarded tại Task18 được apply vào cloud demo riêng sau gate xác minh project/DB.
- Không thêm payment thật, bản đồ, chat, app mobile, nhà cung cấp AI mới hoặc redesign tổng thể.
- Đọc `AGENTS.md` và hướng dẫn liên quan trong `node_modules/next/dist/docs/` trước sửa code Next.js.

---

## 1. Bản này nối vào task tổng ở đâu?

Task tổng: **“Báo cáo tiến độ hiện tại”**, ID `01a06a60-aff7-79a1-ac33-0a3c0fd7b855`.

Snapshot ngày 2026-09-05 (historical): ledger ghi **13/22 = 59% số task nghiệm thu**; Task 14 đang chạy kiểm thử. Đây không phải tỷ lệ sản phẩm hoàn chỉnh hoặc ước lượng thời gian còn lại. Kiểm tra lại snapshot khi bắt đầu vì task tổng vẫn hoạt động.

Checkpoint resume ngày 2026-09-06: acceptance record đánh dấu Task 14 và Task 16 đã accepted, G19 đã PASS theo phạm vi `fallback-only` với `provider=0`, và Task 20 là gate đang hoạt động. Không mở lại các gate đã accepted; đối chiếu candidate/CI SHA hiện tại trước khi bắt đầu G20. Candidate/CI reconciliation, preview URL và browser smoke là các bước riêng; protected cloud mutation smoke chỉ lặp lại khi evidence liên quan bị invalidate và một QA slot chưa dùng đã được xác minh.

| Task tổng | Nguồn cũ | Cách tiếp nối trong bản tích hợp |
|---|---|---|
| 1–7 | `2026-09-04-localens-gemini-edge-runtime.md` | Giữ phần đã nghiệm thu; chỉ mở lại phần chịu ảnh hưởng của thay đổi mới |
| 8–13 | Planner plan, Tasks 1–6 | Giữ kết quả/commit đã đạt; không chạy lại từ đầu vì checkbox tài liệu cũ còn trống |
| 14 | Planner plan, Task 7 | Thêm 14.0–14.6: đối chiếu hiện trạng, recovery/retry/error, UX, kiểm tra tích hợp |
| 15 | Cloud plan, Task 1 | Khóa release candidate và bằng chứng local |
| 16 | Cloud plan, Task 2 | Dùng repository hiện có, hoàn thiện CI trên đúng candidate |
| 17 | Cloud plan, Task 3 | Seeder cloud và dữ liệu trình diễn rõ nguồn, idempotent |
| 18 | Cloud plan, Task 4 | Supabase Cloud riêng, migration/functions/secrets đúng môi trường |
| 19 | Cloud plan, Task 5 | Smoke cloud fallback-only có giới hạn, readback và `provider=0`; live provider chỉ là thí nghiệm tùy chọn |
| 20 | Cloud plan, Task 6 | Vercel preview Supabase runtime |
| 21 | Cloud plan, Task 7 | Review trải nghiệm, vai trò, 20 kịch bản đồ án trên preview |
| 22 | Cloud plan, Task 8 | Phát hành artifact đã kiểm tra, smoke URL cuối, bàn giao và rollback |

Các mục con không làm đổi mẫu số 22. Nếu Task 14 đã được task tổng chốt trong lúc đọc bản này, thêm một mục “Task 14 follow-up” và chỉ mở lại phần chưa được chứng minh; không sửa lịch sử đã ghi.

**Tài liệu thực thi kèm theo:**

- [Task 14 — hợp đồng và kiểm tra](./2026-09-05-localens-luna-task14.md).
- [Tasks 15–22 — phát hành và nghiệm thu](./2026-09-05-localens-luna-release.md).
- [Prompt giao cho task tổng và phiếu review](./2026-09-05-localens-luna-handoff.md).

### Quy tắc giải quyết khác biệt với plan cũ

| Nội dung cũ | Quyết định được dùng |
|---|---|
| GitHub private | Ledger ghi người dùng đã yêu cầu public. Giữ repo hiện có, không tạo lại hoặc đổi visibility |
| Chờ duyệt spec/browser | Ledger ghi đã duyệt và chọn Google Chrome. Tái sử dụng quyết định này, vẫn ghi browser/version trong evidence |
| Planner chỉ có recommend/refine | Giữ `getPlan(planId, locale)` đã được bổ sung trong runtime port |
| Demo AI → đặt lịch trình AI | Hai luồng riêng: planner tạo/tinh chỉnh/mở lại; fixed tour đặt/thanh toán mô phỏng. Không ngụ ý lịch trình AI mua trực tiếp được |
| Test cũ dùng `pnpm test:run -- tests/...` | Windows dùng `corepack.cmd pnpm test:run tests/...`; không thêm literal `--` trước đường dẫn |
| Bằng chứng trên base SHA | Chỉ chứng minh base SHA; draft hoặc dirty tree không đủ để chốt candidate |
| Nhận được quota error thì có fallback | Chỉ nói có phương án dự phòng khi response thật sự chứa proposal hợp lệ |

Thứ tự thẩm quyền: yêu cầu mới nhất của người dùng → quyết định rõ trong task tổng → spec và ruling đã chấp thuận → plan tích hợp này khi được đưa vào thực thi → chi tiết plan cũ. Code là bằng chứng hiện trạng, không tự thay thế yêu cầu. Mâu thuẫn chưa giải quyết phải ghi riêng, không tự chọn hướng dễ test hơn.

## 2. Phạm vi bổ sung để thầy có thể tự trải nghiệm

**Bắt buộc trước release:** giữ/lấy lại lịch trình sau reload; retry không tạo dữ liệu trùng do mất phản hồi; thông báo lỗi đúng nguyên nhân; dữ liệu thử dễ hiểu; tài khoản ba vai trò; hướng dẫn thử hai luồng; kiểm thử cloud qua protected `fallback-only` smoke với `provider=0`; báo cáo giới hạn AI/thanh toán trung thực. Provider thật và `GEMINI_API_KEY` không bắt buộc; `live-success` là thí nghiệm tùy chọn tách riêng.

**Giới hạn nhỏ để làm nhanh:** chỉ phục hồi lịch trình gần nhất của tài khoản trên trình duyệt đó; chưa làm thư viện lịch trình, tìm kiếm/sắp xếp/phân trang. Có 2–3 lựa chọn gợi ý trên các control đã có, không xây hội thoại tự do. Dữ liệu khởi điểm hướng tới 12 địa điểm và 3 tour thử đủ kịch bản, tăng số lượng chỉ khi có nguồn/nhãn hợp lệ; số lượng không thay thế chất lượng dữ liệu.

`/custom-request` cần được đối chiếu với rubric/báo cáo: nếu đồ án bắt buộc yêu cầu cá nhân hóa → báo giá → booking thì phạm vi hiện tại chưa đủ. Khi chưa có rubric xác nhận, phát hành chỉ cam kết hai luồng đã nêu. Không làm giả quy trình quote/booking để khớp lời thuyết trình; bổ sung quy trình này cần quyết định riêng trước triển khai.

Không tuyên bố “AI hiểu mọi yêu cầu bằng tiếng Việt”. Tinh chỉnh chỉ quảng bá những ràng buộc được parser/engine hiện tại hỗ trợ và test chứng minh. Sửa copy nhỏ để phản ánh đúng khả năng; không huấn luyện hoặc thêm parser mới trong đợt này.

## 3. Chốt đúng checkout và tránh đụng task đang chạy — Gate G0

**Checkout triển khai được quan sát:**

```text
C:\Users\Admin\AppData\Local\Temp\locallens-acceptance-60c815a-ca52bc2a806c43b19de4bf302de91353
branch: codex/thesis-release-final
base quan sát: b9f08d589bb972d290c4c367e8a02c636224d512
```

**Nơi lưu bộ plan để review:** worktree `C:\Users\Admin\Documents\Project\localens\.worktrees\localens-mvp`. Đây không phải bằng chứng rằng code mới nhất ở worktree này. Không chạy implementation ở đây chỉ vì task mở tại đây.

- [ ] Controller đọc tiến độ mới nhất của task tổng bằng một snapshot, xác nhận checkout thực tế và người đang sở hữu các file/test runtime.
- [ ] Nếu task tổng còn kiểm thử/ghi file, chỉ review/read-only; đưa thay đổi vào checkpoint kế tiếp. Không mở một controller triển khai cạnh tranh.
- [ ] Khi có quyền điều phối tại checkpoint, đọc 3 plan gốc + spec + ledger từ checkout triển khai. Ghi `git status`, HEAD và danh sách dirty có sẵn; không tự dọn chúng.
- [ ] Đưa 4 tài liệu `2026-09-05-localens-*-*.md` của bộ này vào checkout triển khai bằng đường dẫn tường minh; xác minh SHA256 từng file. Đây là bản được sử dụng tiếp; bản trong worktree review trở thành snapshot và không sửa song song.
- [ ] Chèn mục “Integrated plan 2026-09-05” vào ledger hiện có, ghi path bản plan, hash, task hiện tại, rulings và phạm vi bổ sung. Không thay ledger bằng một bảng tiến độ độc lập.
- [ ] Dùng cùng identity `.superpowers/sdd/2026-09-04-localens-supabase-planner-experience/` đến hết Task 14; Cloud15–22 tiếp tục identity của cloud plan, có liên kết hai chiều.

Lệnh đọc trạng thái, chạy với `workdir` trỏ checkout triển khai đã xác minh:

```powershell
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short
corepack.cmd pnpm --version
node --version
```

**PASS G0:** một controller, một checkout được xác minh, dirty baseline lưu riêng, không có file owner trùng, task mới nhất đã được đối chiếu. Sai path hoặc writer chưa bàn giao: BLOCKED phần sửa, tiếp tục review độc lập.

## 4. Cấu hình Luna thực thi, Astra review

Yêu cầu mới thay thế cấu hình Luna/xhigh cho tất cả vai trò ở bản trước:

| Nhóm | Model ID | Reasoning effort | Speed yêu cầu | Service tier cấu hình mục tiêu |
|---|---|---|---|---|
| Controller và implementer | `gpt-5.6-luna` | `max` | Fast | `fast`, ánh xạ request thành `priority` |
| Reviewer độc lập | `gpt-6-astra` | `high` | Normal | `default`, Fast tắt |

Model, reasoning effort và speed là ba thiết lập riêng. `max` không tự bật Fast; `high` không tự tắt Fast. Runtime hiện tại xác nhận hai model hỗ trợ các effort nêu trên. Bản cập nhật này sửa plan/prompt, không tự đổi cấu hình task tổng đang chạy hoặc global `config.toml`.

**Kiểm tra trước dispatch:** công cụ `collaboration.spawn_agent` hiện có cho khai báo `model`, `reasoning_effort`, `fork_turns`, nhưng không có đối số `service_tier`/`speed`. Không thêm tham số không được hỗ trợ, không suy speed từ tên vai trò hoặc parent, và không nói đã ép Fast/Normal chỉ nhờ prompt. Khi thực thi, dùng cơ chế chọn tốc độ theo phiên/agent được runtime thực sự hỗ trợ; ghi cả requested và effective model/effort/tier vào ledger. Nếu chưa thiết lập hoặc xác minh được speed riêng, đánh `SPEED_NOT_VERIFIED` và báo đúng giới hạn trước dispatch phụ thuộc cấu hình; không âm thầm cho reviewer kế thừa Fast. Không sửa global config qua lại khi các agent đang chạy song song để giả lập tốc độ riêng.

Theo [OpenAI Docs về Speed](https://learn.chatgpt.com/docs/agent-configuration/speed), Fast dùng nhiều credits hơn Standard; tài liệu hiện ghi GPT-5.6 dùng mức2.5lần Standard khi đăng nhập ChatGPT. Vì vậy cấu hình này là lựa chọn cân bằng thời gian/chi phí của người dùng, không được khẳng định rẻ nhất. API key có cách tính phí riêng. [Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference) mô tả service tier độc lập với model/effort và `fast` ánh xạ thành `priority`.

Tối đa **4 agent hoạt động gồm controller**:

| Vai trò | Trách nhiệm | Hạn chế |
|---|---|---|
| C — controller Luna Max/Fast | Giữ scope/ledger/file locks; tích hợp; tự kiểm tra kết quả; quyết định gate | Duy nhất chạy Git ghi, build và runtime/DB integration |
| A — implementer Luna Max/Fast | Một task backend/contract nhỏ đã có brief | Chỉ sửa file được giao; không commit/push/reset/start DB |
| B — implementer Luna Max/Fast | Một task UI hoặc tài liệu/fixture độc lập | Không sửa chung runtime port/dictionaries với A |
| R — reviewer Astra High/Normal | Review độc lập spec rồi chất lượng/test; trả PASS/FAIL có vị trí; quan sát evidence | Read-only đối với mutation; không tự sửa implementation mình review hoặc chạy browser mutation |

Tạo worker mới cho task độc lập bằng `fork_turns="none"`; truyền đầy đủ brief tự chứa ngữ cảnh. Khi sửa findings có thể tiếp tục cùng implementer, nhưng reviewer vẫn độc lập. Nếu slot chưa rảnh thì xếp hàng, không tạo quá giới hạn. Không tự nâng sang model khác khi gặp khó.

**Giảm chi phí mà giữ gates:** Luna tự chạy focused tests và hoàn thiện evidence trước khi gọi Astra; Astra nhận diff đúng phạm vi + spec/contract + log cần thiết, không toàn bộ lịch sử chat. Một lượt Astra có thể kiểm hai mục spec compliance rồi code quality theo thứ tự, trả hai kết luận rõ; cả hai phải PASS. Khi sửa finding, re-review diff sửa và regression liên quan, chỉ mở rộng nếu có tác động mới. Astra không chạy vòng lặp báo trạng thái, không chờ build/DB thay controller và không viết lại implementation của Luna. Final review tích hợp vẫn bắt buộc.

### Lịch song song được phép

| Wave | Nhánh 1 | Nhánh 2 | Khi nào được qua wave? |
|---|---|---|---|
| W0 | Đọc hợp đồng/retry | Đọc cloud/seed + UX evidence | G0 đạt, không sửa code |
| W1 | 14.1 đóng băng hợp đồng và thử nghiệm RED | R chuẩn bị ma trận quyền/retry read-only | Hợp đồng được review PASS |
| W2 | 14.2 cơ chế operation backend | 14.3 pure storage helper + tests | Không chia sẻ file; port/dictionary khóa tại C |
| W3 | 14.3 tích hợp adapter/UI | B soạn script trải nghiệm/seed manifest bằng tài liệu | Backend đạt trước tích hợp; B không sửa UI |
| W4 | 14.4 lỗi/copy/preset theo thứ tự | R kiểm tra accessibility/source hiện có | Không sửa chung dictionary/component |
| W5 | C chạy 14.5/14.6 integration | R review diff; B chuẩn bị cấu hình release dưới dạng tài liệu | G14 PASS trước công nhận G15 |
| W6 | 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 | Chuẩn bị checklist/tài liệu bước sau read-only | Mỗi gate đạt mới được chạy mutation phụ thuộc |

Không chạy build demo và Supabase song song trên cùng `.next/out`; không chạy hai runtime harness cùng lúc; không đổi port/schema của job khác. Thời gian rút ngắn nhờ chia việc độc lập và focused tests, không nhờ bỏ kiểm tra.

## 5. Hợp đồng giao việc và kiểm tra ở mọi task

Mỗi brief phải được lưu trong ledger task tổng, gồm đủ:

```text
Task ID; mục tiêu người dùng quan sát được; dependency đã PASS.
Execution root; base SHA; dirty baseline; file allowlist; file bị khóa.
Spec/ruling cụ thể; interface inputs/outputs; điều không thuộc phạm vi.
Tên test + hành vi cần RED; command chính xác; kết quả PASS mong đợi.
Evidence path; các điều kiện dừng; reviewer nhận bàn giao.
```

- [ ] C xác nhận dependency đạt và cấp file lock trước khi giao việc.
- [ ] Worker đọc code/test liên quan, báo khác biệt với brief trước khi sửa interface.
- [ ] Với bug/behavior: thêm regression test, chạy RED vì đúng nguyên nhân (import lỗi/DB chưa chạy không tính là RED nghiệp vụ).
- [ ] Worker sửa tối thiểu, chạy focused test GREEN, kiểm tra diff ngoài scope.
- [ ] R review **spec compliance**: đúng mục tiêu, không thiếu case âm tính, không mở rộng phạm vi.
- [ ] R review **code quality**: xem code và tests thật, kiểm tra trust boundary, state/race, thông báo và logging.
- [ ] C chạy lại lệnh kiểm tra cần thiết trên tree đã tích hợp; không chấp nhận chỉ lời worker “PASS”.
- [ ] C ghi kết quả, file hashes/commit, release locks, rồi mới đánh PASS và mở task phụ thuộc.
- [ ] Commit chỉ theo quyền đã có của task tổng; stage file tường minh, không `git add .`; không đưa artifact chứa dữ liệu nhạy cảm lên public repo.

Nếu FAIL: ghi một nguyên nhân có bằng chứng, sửa tại task đó, re-review đúng diff và test liên quan. Hai vòng cùng lỗi: ngừng vá phỏng đoán, dùng `superpowers:systematic-debugging`, rút nhỏ phạm vi hoặc tạo reproduction. Không tăng timeout tùy ý, skip test, nới assertion, sửa fixture để che bug, hoặc báo “flaky” khi chưa có bằng chứng. Sau một lỗi timeout chỉ retry tự động nếu harness đã có chính sách giới hạn và phân loại lỗi phù hợp.

Pure copy/tài liệu không cần tạo test phản chiếu chuỗi mới nếu không có thay đổi hành vi; dùng review hai ngôn ngữ, screenshot và kiểm tra link. Mọi lỗi quyền, dữ liệu, tiền, persistence hoặc retry cần regression hành vi.

### Phiếu evidence bắt buộc

```json
{
  "task": "14.3",
  "state": "PENDING",
  "productSha": null,
  "workingTreeFingerprint": null,
  "environment": "isolated-local",
  "command": null,
  "startedAt": null,
  "finishedAt": null,
  "exitCode": null,
  "counts": null,
  "artifacts": [],
  "reviewer": null,
  "findingsOpen": [],
  "dependsOn": ["14.2"]
}
```

`null` nghĩa chưa chạy/chưa có, không phải PASS. Không dùng số test từ lịch sử làm số hiện tại. Release chỉ nhận evidence đã có product SHA xác định. Doc-only evidence commit có thể khác product SHA nếu manifest chứng minh toàn bộ input code/config/seed không đổi; log phải ghi cả hai.

## 6. Khi nào cần hỏi người dùng?

Tiếp tục với việc đã được ủy quyền trong task tổng; không hỏi lại public GitHub hay Chrome. Chỉ dừng phần phụ thuộc khi thiếu đăng nhập/secret/quyền tài khoản, chưa xác định được project đích, hành động phát sinh chi phí chưa được chấp thuận, hoặc rubric yêu cầu thêm nghiệp vụ ngoài hai luồng đã chốt. Chuẩn bị diff/config/checklist review được trước khi hỏi.

Không gửi key hoặc mật khẩu qua chat. Không tự gửi thông tin cho thầy. Không tạo task Codex mới chỉ để chia worker. Bản plan này không phải yêu cầu đổi cấu hình, deploy hay publish ngay trong phiên review.

## 7. Review mức sản phẩm và tiêu chí hoàn tất

| Câu hỏi của mentor | Bằng chứng để trả lời |
|---|---|
| Thầy mở link khi máy phát triển tắt có dùng được? | URL cloud dùng Supabase Cloud, không request localhost/LAN/tunnel; thử bằng phiên trình duyệt mới ở mạng độc lập nếu có |
| Có hiểu bước tiếp theo? | Hướng dẫn 10 phút; CTA, empty/loading/error rõ; cả hai luồng hoàn tất được |
| AI làm gì thật? | Protected fallback-only cloud smoke có readback DB, `provider=0`, source label đúng và evaluation ghi rõ phần engine xác định; provider thật chỉ là thí nghiệm tùy chọn |
| Dữ liệu có thật/được bán không? | Nhãn nguồn/fixture, không tự chuyển `research_only` sang thương mại; giá/giờ thử nghiệm được nêu đúng |
| Có bảo vệ quyền và trạng thái? | Test owner A/B, admin/guide/customer, payment-cancel, retry và RLS |
| Đồ án và website có khớp? | Bảng 20 case → route → nghiệp vụ → kỳ vọng → evidence; cập nhật UML/prose theo runtime, giữ bản tài liệu gốc |

**Hoàn thành kỹ thuật:** G0, G14–G22 đạt; không còn finding Critical/Important; URL cuối chạy luồng cloud; rollback và tài khoản demo bàn giao riêng. **Xác nhận sử dụng để bảo vệ:** người dùng thử URL và xác nhận phù hợp; nếu chưa nhận phản hồi thì ghi “đã nghiệm thu kỹ thuật, chờ chủ đồ án thử”, không tự tick thay.

Không có plan hay model nào đảm bảo không sai tuyệt đối. Quy trình này buộc sai sót phải được phát hiện bằng kiểm tra độc lập, giới hạn phạm vi ảnh hưởng và không cho một lời khẳng định không có bằng chứng trở thành tiến độ đã hoàn thành.

## 8. Nguồn để cập nhật khi thực thi

- Sự hỗ trợ model/effort: metadata runtime Codex hiện tại; đối chiếu [OpenAI GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) nếu nền tảng thay đổi. Không suy năng lực bảo đảm từ tên model.
- Hướng dẫn Next.js: tài liệu cài cùng phiên bản trong `node_modules/next/dist/docs/`.
- API/hosting thay đổi theo thời gian: kiểm tra tài liệu chính thức Supabase, Vercel, Gemini trước Task 18–22. Ghi ngày và URL nguồn trong release manifest, không dùng trí nhớ để đoán CLI flag, tên model hoặc free-tier quota.
