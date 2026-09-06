# LocalLens — prompt tiếp nối task tổng và phiếu review

**Ủy quyền cập nhật của người dùng:** người dùng đã yêu cầu trợ lý tự áp dụng bộ plan vào task tổng và tiếp tục thực thi, không yêu cầu họ tự thao tác hoặc xác nhận lại. Quyết định này thay trạng thái chỉ review ở bản trước. Task tổng tiếp nhận tại checkpoint an toàn, cập nhật ledger thực tế rồi tiếp tục trong phạm vi plan; giữ các cổng bằng chứng và các giới hạn về dữ liệu/secret/quyền tài khoản. Thiếu điều kiện bên ngoài thì ghi blocker ở bước phụ thuộc và tiếp tục phần độc lập có thể làm, không suy đoán credential hoặc đánh PASS giả.

Bộ plan ban đầu được tạo để review, nay được người dùng yêu cầu áp dụng theo đoạn ủy quyền trên. Đọc [plan chính](./2026-09-05-localens-integrated-luna-execution.md), [Task14](./2026-09-05-localens-luna-task14.md) và [Tasks15–22](./2026-09-05-localens-luna-release.md). Bằng chứng triển khai thực tế vẫn do task tổng ghi nhận sau khi thực hiện.

## Prompt để đưa vào chính task tổng

Controller và agent thực thi dùng **GPT-5.6 Luna / Max / Fast**; reviewer dùng **GPT-6 Astra / High / Normal**. Chọn/kiểm tra cả model, effort và speed riêng; prompt không tự đổi các thiết lập này. Cấu hình mới thay thế Luna/xhigh cho mọi vai trò ở bản plan trước.

```text
Hãy tiếp nối task tổng “Báo cáo tiến độ hiện tại”, không tạo roadmap hoặc controller cạnh tranh.

Review rồi tích hợp bộ plan sau vào ledger/roadmap 22 task đang chạy:
C:\Users\Admin\AppData\Local\Temp\locallens-acceptance-60c815a-ca52bc2a806c43b19de4bf302de91353\docs\superpowers\plans\2026-09-05-localens-integrated-luna-execution.md
C:\Users\Admin\AppData\Local\Temp\locallens-acceptance-60c815a-ca52bc2a806c43b19de4bf302de91353\docs\superpowers\plans\2026-09-05-localens-luna-task14.md
C:\Users\Admin\AppData\Local\Temp\locallens-acceptance-60c815a-ca52bc2a806c43b19de4bf302de91353\docs\superpowers\plans\2026-09-05-localens-luna-release.md
C:\Users\Admin\AppData\Local\Temp\locallens-acceptance-60c815a-ca52bc2a806c43b19de4bf302de91353\docs\superpowers\plans\2026-09-05-localens-luna-handoff.md

Trước tiên đọc checkpoint/HEAD/dirty baseline hiện tại. Snapshot lúc lập plan là 13/22 ở Task14 và phải giữ nhãn historical. Execution clone hiện tại là `C:\Users\Admin\AppData\Local\Temp\locallens-acceptance-60c815a-ca52bc2a806c43b19de4bf302de91353`, branch `codex/thesis-release-final`, HEAD `b58f426`; acceptance record đánh dấu Task14 và Task16 đã accepted, G19 đã PASS theo phạm vi `fallback-only` với `provider=0`, và resume ở Task20 (`19/22 task gates`). Candidate/CI SHA phải được đối chiếu trước G20; không dùng entry historical hoặc HEAD chưa reconcile làm candidate mới. Nếu writer/test đang chạy, chỉ đọc và ghi blocker; giữ phần đã nghiệm thu, không làm lại Tasks1–13 hoặc sửa lịch sử.

Dùng Superpowers subagent-driven-development và Product Design để review UX theo evidence/design system hiện có. Controller/worker triển khai dùng gpt-5.6-luna, reasoning_effort=max, Speed Fast. Reviewer độc lập dùng gpt-6-astra, reasoning_effort=high, Speed Normal. Tạo agent với fork_turns=none và brief tự chứa đầy đủ path/contract/tests. Tối đa 4 agent gồm controller; chỉ song song việc không dùng chung file, Git index, build cache, port hoặc database.

Kiểm tra requested/effective model, effort và service tier trước khi giao việc. Speed Fast mục tiêu là service_tier=fast (request priority), Normal là default/Fast tắt. Nếu tool spawn chỉ nhận model/effort mà không nhận service tier, không thêm tham số giả và không suy speed từ parent; ghi SPEED_NOT_VERIFIED, báo giới hạn và dùng cơ chế cấu hình riêng theo phiên được runtime hỗ trợ trước dispatch. Không đổi global config qua lại giữa các agent chạy song song; không tự để Astra reviewer dùng Fast.

Luna hoàn thiện code/focused tests/evidence trước khi gọi Astra. Astra review đúng diff, contract và log; một lượt kiểm spec rồi chất lượng với hai kết luận riêng. R chỉ review/quan sát evidence độc lập và read-only đối với mutation. C hoặc Luna được ủy quyền mới chạy browser/cloud mutation trong dataset QA hữu hạn. Fix được re-review theo diff sửa; không bỏ gate, không gọi reviewer liên tục để báo trạng thái. Cấu hình Fast là lựa chọn tăng tốc có chi phí credits cao hơn Normal, không tự bảo đảm tổng chi phí thấp nhất.

Áp dụng G0: xác định đúng execution root, người sở hữu file, đưa bản plan đã review vào checkout thực thi và ghi hash/source trong ledger hiện có. Không tạo hai ledger tiến độ cạnh tranh. Dùng rulings mới nhất: giữ GitHub public hiện có và Chrome đã được chọn; không hỏi lại hai việc đó.

Thứ tự lịch sử: 14.0 đối chiếu gaps → 14.1 review/freeze contract → backend operation/pure session helper độc lập → tích hợp recovery/UI/error → full local gate → G14 → Tasks15–22 theo dependencies. Lần resume này bắt đầu ở Task20 sau G19 fallback-only PASS; không mở lại gate accepted. Mỗi task: regression RED đúng nguyên nhân → implement tối thiểu → focused GREEN → reviewer độc lập kiểm tra spec rồi chất lượng → controller tự xác minh → cập nhật evidence/ledger → mới mở task phụ thuộc.

Không report PASS từ lời agent, build-only, HTTP200 hoặc log cũ. Ghi command/exit code/actual test counts/product SHA/config/DB identity/artifact. Code/config đổi thì invalidate evidence liên quan. Push/reconcile candidate, CI head/current SHA và preview URL/browser smoke là các kiểm tra riêng với protected finite cloud mutation smoke; chỉ lặp mutation smoke khi evidence liên quan bị invalidate và một QA slot chưa dùng đã được xác minh. Không giảm assertion, skip test, tăng timeout tùy ý hoặc tự đổi model/provider để vượt gate. Hai vòng cùng lỗi phải điều tra reproduction bằng systematic-debugging.

Giữ scope: thầy tự dùng URL cloud; planner tạo/refine/mở lại và fixed-tour booking/payment mô phỏng là hai luồng riêng. Không ngụ ý itinerary AI được mua trực tiếp. Không thêm thanh toán thật, public signup, maps/chat/mobile hoặc redesign. Không bịa nguồn dữ liệu, commercial approval hay khả năng AI.

Tiếp tục phần đã được ủy quyền trong task tổng. Chỉ hỏi khi thiếu quyền/project/secret thực sự hoặc cần quyết định nghiệp vụ ngoài scope; chuẩn bị cấu hình/diff review được trước. Không reset DB presentation/cloud, không sửa/xóa công việc ngoài scope, không in secret, không gửi thông tin cho thầy thay tôi.

Giữ scope: thầy tự dùng URL cloud; planner tạo/refine/mở lại và fixed-tour booking/payment mô phỏng là hai luồng riêng. G19/G20/G21/G22 dùng release `fallback-only` với `provider=0`, không yêu cầu provider thật hoặc `GEMINI_API_KEY`; `live-success` là thí nghiệm tương lai tách riêng. Không ngụ ý itinerary AI được mua trực tiếp. Không thêm thanh toán thật, public signup, maps/chat/mobile hoặc redesign. Không bịa nguồn dữ liệu, commercial approval hoặc khả năng AI.

Task20 phải giải quyết Turnstile trước build: no-Turnstile path được hỗ trợ khi site key vắng; site key nonempty đã cấu hình thì giữ nguyên. Candidate không có widget/token-verification integration, nên không thêm phantom service dependency và không gỡ bỏ auth/CAPTCHA protection. Cần focused test/review cho behavior này hoặc key thật/domain thật; không dùng chuỗi giả. G20/G21 browser QA vẫn thuộc release `fallback-only` với `provider=0`. Task22 phải hoàn tất preview stop/recovery drill và compatible version manifest trước promote, rồi mới smoke URL cuối; ghi effective environment-dependent headers cùng `APP_URL`.

Ở lượt đầu sau prompt này, ghi ngắn checkpoint thật, các thay đổi tích hợp, dependency/file-lock conflicts và brief kế tiếp, rồi tiếp tục thực thi trong cùng task theo ủy quyền mới. Sau mỗi bước hoàn thành, báo đúng bốn mục: outcome; test/evidence và reviewer; next gate; blocker nếu có. Không dùng số task hoặc phần trăm task như tỷ lệ hoàn thành sản phẩm. Không kết thúc chỉ để hỏi duyệt lại plan hoặc yêu cầu người dùng tự dán prompt. Quyền tài khoản/secret bên ngoài vẫn phải có thật; không suy việc áp dụng plan là quyền bỏ qua các gate đó.
```

## Mẫu brief một worker

Controller điền các trường từ checkpoint thật trước khi dispatch; đây là schema hướng dẫn, không giao nguyên brief thiếu thông tin.

```json
{
  "taskId": "14.3",
  "model": "gpt-5.6-luna",
  "reasoningEffort": "max",
  "requestedSpeed": "fast",
  "requestedServiceTier": "fast",
  "mode": "implementation-after-gate",
  "scope": "Pure runtime planner session helper and tests only",
  "allowedFiles": [
    "lib/application/planner/runtime-planner-session.ts",
    "tests/unit/planner/runtime-planner-session.test.ts"
  ],
  "forbiddenActions": ["commit", "push", "start database", "edit shared UI or port"],
  "inputContract": "RuntimePlanPointer and helper signatures in task14 plan, after G14.1 review",
  "verificationCommand": "corepack.cmd pnpm test:run tests/unit/planner/runtime-planner-session.test.ts --no-file-parallelism --testTimeout=30000",
  "requiredCases": ["valid pointer", "wrong owner", "expired", "future timestamp", "malformed JSON", "storage throws", "unrelated key preserved"],
  "return": ["files changed", "RED cause", "GREEN evidence", "remaining limitations", "out-of-scope findings"]
}
```

C phải bổ sung execution root/base SHA/dirty baseline/dependency status/evidence path ngay trước giao việc; thiếu một trong các trường đó thì brief chưa sẵn sàng. Không dùng path tương đối ngoài `workdir` đã xác minh.

`requestedSpeed`/`requestedServiceTier` là metadata yêu cầu trong brief, **không phải** tham số được phép truyền vào tool spawn hiện tại. Brief reviewer đổi sang `model: gpt-6-astra`, `reasoningEffort: high`, `requestedSpeed: normal`, `requestedServiceTier: default`; quyền reviewer là read-only. Controller phải ghi effective tier từ UI/runtime evidence, không tự điền bằng requested tier.

## Phiếu review dành cho bạn hoặc reviewer khác

| Mục review | Câu hỏi để chấp nhận |
|---|---|
| Nối task tổng | Có giữ mapping1–22, ledger hiện hữu và checkpoint mới nhất? |
| Scope | Có đúng website demo để thầy xem? Phần mới nào là cần thiết, phần nào hoãn? |
| Flow | Planner và tour booking có được mô tả đúng thành hai luồng? |
| Dependency | Task tiêu thụ API có chờ producer được review và kiểm tra? |
| Multi-agent | Có giao hai người cùng file/config/DB/build cache? C có là người duy nhất làm Git/integration? |
| Anti-hallucination | Các finding có source/reproduction? Tên file/API mới được ghi rõ là mới? |
| Tests | Test kiểm tra hành vi/quyền/dữ liệu thật hay chỉ lặp implementation? Có case âm tính/race? |
| Data | Demo fixtures riêng, không giả commercial approval; seed rerun/partial failure có an toàn? |
| Evidence | SHA/environment/artifact/exit code có khớp và được kiểm chứng? |
| Cloud | Có xác minh origin/env baked/Auth/RLS/readback/fallback-only với `provider=0` và production URL? Provider thật chỉ khi thí nghiệm tùy chọn được mở riêng. |
| Bàn giao | Có tài khoản riêng, hướng dẫn10phút, giới hạn và rollback thật? |

Finding dùng định dạng: `mức độ → task/đoạn → tình huống gây lỗi → tác động → thay đổi đề nghị → cách chứng minh đã sửa`. Blocker/Critical/Important phải xử lý trước PASS task phụ thuộc. Minor chỉ được để lại nếu không vi phạm acceptance và ghi rõ lý do/owner; không dùng nhãn Minor để hạ mức lỗi.

## Trạng thái review bộ plan

**Cập nhật phân vai:** từ yêu cầu mới, các lượt review thực thi kế tiếp dùng Astra High/Normal; implementer dùng Luna Max/Fast. Những ghi chép “Luna xhigh” bên dưới là lịch sử review bản plan trước, giữ nguyên để không gán sai model đã thực sự review. Chưa có lượt Astra nào được chạy chỉ bởi việc chỉnh tài liệu này.

- Bản nháp được đối chiếu với code/spec/ledger của checkout đang triển khai ngày 2026-09-05.
- Đã có review độc lập bằng Luna xhigh; bảng dưới ghi findings và sửa đổi tài liệu. Đây là review **kế hoạch**, không phải xác nhận implementation/test/deploy đã đạt.
- Các checkbox implementation còn trống có chủ đích: chúng là công việc sẽ thực hiện, không phải kết quả đã chạy.

### Self-review đã thực hiện

- Mapping đầy đủ22task, scope/rulings và guard bảo vệ checkout/DB đã đối chiếu với spec/ledger hiện tại.
- Kiểm tra22đường dẫn source/test hiện có: đều tồn tại trong checkout triển khai. Các path mới được ghi rõ “Tạo”; file migration timestamp được xác định tại checkpoint để không đụng writer khác.
- Liên kết tương đối giữa4tài liệu hợp lệ; code fences cân bằng; không có trailing whitespace hoặc chỉ dẫn bỏ trống phần triển khai.
- Đã sửa dependency vòng ở14.2/14.5; gate DB được đưa trước consumer integration.
- Đã sửa generated-types path,4account/3role cho cross-owner, giới hạn Auth dry-run/SQL rollback, CI staging thiếu URL và public-env/origin khi promote.
- Đã xem xét phương án UUID-only nhỏ hơn; không chọn nó làm bằng chứng cho invariant chống duplicate provider và input conflict trước side effect.
- Chỉ tài liệu mới của bộ plan được tạo trong worktree review. Không chạy suite sản phẩm, sửa implementation, seed/reset DB, thay model task tổng hay deploy trong phiên lập plan.

### Đối chiếu coverage với spec gốc

| Yêu cầu spec ngày2026-09-04 | Task/gate chịu trách nhiệm |
|---|---|
| Đích public thesis demo và scope | Master phần1–2; G22; ruling repo public |
| Gemini chỉ rank, engine quyết định tính hợp lệ | Giữ Tasks1–7; hồi quy14.2/14.5; G19 fallback-only với `provider=0`; live là thí nghiệm tùy chọn tách riêng |
| Không PII, strict output/ID/quota |14.1–14.4; G14 DB/contract; G19; review trust boundary |
| Auth và ba vai trò, signup tắt | G17 bốn account/ba vai trò; G18; E03/E13/E19 |
| Payment mô phỏng, cancel và concurrency |14.5; G19; E14–E18 |
| UI states, Việt/Anh, ba viewport |14.3–14.4; G21/E01–E20 |
| Server secrets, CORS và logging | G16 scan; G18–G20; G22 origin/bundle check |
| Local demo/local runtime/cloud tách biệt | Master evidence; G14; G19; G20; G22 |
| Unit/Edge/DB/browser coverage |14.1–14.6; G17/G19 tests; G21 matrix |
| Release SHA, migration/functions/seed | G15 manifest; G18/G20/G22 version verification |
| Rollback/frontend/Edge/DB/AI | G15 baseline; G19 kill-switch restore; G22 drill |
| Tài khoản, runbook, user sign-off | G17/G21/G22; kênh bàn giao riêng |

Giới hạn cần chủ đồ án review: quy trình cá nhân hóa → quote → booking chưa nằm trong cam kết runtime này; thư viện lịch trình nhiều bản và vận hành thương mại được hoãn. Nếu rubric bắt buộc những phần đó thì bổ sung phạm vi trước khi gọi website đáp ứng toàn bộ đồ án.

### Findings độc lập và cách xử lý trong bản plan

| Finding | Sửa đổi đã đưa vào tài liệu | Gate phải chứng minh khi thực thi |
|---|---|---|
| Critical: operation RPC/commit chưa định nghĩa đủ | Task14.2 có5RPC signatures, return union, grants, wrapper cùng transaction và revoke đường ghi vòng |14.1 review contract;14.2.C pgTAP/RLS/crash/concurrency |
| Replay refine bị stale check chặn | Lookup/digest/replay trước latest/base/snapshot/quota | Retry sau một revision mới hơn vẫn đọc đúng operation |
| Thiếu terminal error state | `rejected` với allowlisted code, replay error không reserve/provider | Quota/domain/catalog rejection không nằm pending tới timeout |
| Quota IDs chưa có chủ thể sinh rõ | DB tạo và lưu hai UUID riêng khi claim, không nhận từ client | Replay/kind mismatch/counter assertions |
| Refine runtime có thể còn guest branch | Hai entrypoint authenticated-only, JWT customer trước claim | Negative JWT/guest/non-customer test không chạm side effect |
| Lệnh cấm cloud seed mâu thuẫn Task18 | Chỉ cấm target chưa xác minh/ngoài demo; guarded apply được phép sau gate | Verifier và seeder guards |
| Account count/cross-owner không nhất quán |4account/3vai trò, QA customer bắt buộc, expected apply count rõ | Seed idempotency và cross-owner read/write denial |
| Budget live/fallback dễ hiểu nhầm | Release fallback-only1endpoint/0provider; live-success tối đa2provider attempts chỉ trong thí nghiệm tùy chọn | Counters độc lập và không auto retry |
| QA có thể làm hết chỗ tour cho thầy | QA departures/customer riêng,4slots,stable keys/capacity budget | Teacher capacity trước/sau không đổi |
| Project/DB binding còn mô tả chung | Verifier input/output, metadata độc lập, TLS,inventory,marker và bootstrap refusal | Wrong ref/org/pooler/marker tests |
| Pending feedback có thể chứa raw note | Schema supported signals, pure shared normalizer và canonical fixed phrases | Storage/retry/digest/log không chứa raw text |
| Canonical digest chưa chuẩn hóa | v1 encoding, key ordering, set ordering và meaningful fields | Equivalent order cùng digest; mutation khác khác digest |

Các sửa đổi trên không thay thế review source khi implementation được viết. Controller vẫn phải đi qua gates; không được suy “plan đã review” thành quyền bỏ test hoặc bắt đầu deploy.

**Lượt kiểm tra lại:** reviewer Luna không còn finding Critical ở cấp plan; còn2Important về nhánh terminal rejected và mapping đủ rejected codes. Controller đã sửa state machine, thêm case terminal/replay, bảng HTTP/message/CTA đầy đủ và optional operationState để phân biệt retry cùng key với thao tác mới. Controller kiểm tra coverage của enum với bảng mapping; việc chứng minh code thực tế vẫn nằm ở14.1/14.2.C/14.4. Bộ tài liệu sẵn sàng để chủ đồ án xem và review phạm vi.
