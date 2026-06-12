# Dàn ý slide bảo vệ đề xuất

Tài liệu này đề xuất bộ slide **13 slide** cho phần bảo vệ 10-15 phút, với trọng tâm nghiêng về **kỹ thuật hệ thống**. Logic trình bày đi theo trục:

1. Bài toán và phạm vi
2. Kiến trúc và vận hành hệ thống
3. Pipeline AI và artifact
4. Benchmark để chứng minh hệ thống chạy được
5. Đóng góp, hạn chế và định hướng

Nguyên tắc chung:

- Các slide mở đầu và kết luận nên ngắn.
- Các slide về kiến trúc, luồng xử lý, orchestration backend, AI pipeline và benchmark interpretation phải được dành nhiều thời lượng hơn.
- Không nên cố làm mọi slide có thời gian nói như nhau.

## Slide 1 — Đề tài và cách định vị

- **Mục tiêu slide:** Giới thiệu đề tài và định vị đúng bản chất đồ án.
- **Nội dung chính nên đưa:**
  - Tên đề tài
  - Tên sinh viên, giảng viên hướng dẫn
  - Một câu định vị: đây là đồ án phát triển hệ thống phần mềm end-to-end có tích hợp Machine Learning
- **Hình ảnh/sơ đồ/bảng nên dùng:** 1 ảnh mockup app hoặc ảnh player/processing screen.
- **Key message:** Đây không phải đề tài huấn luyện mô hình mới, mà là đề tài xây dựng một hệ thống hoàn chỉnh có tích hợp ML.
- **Không nên nói quá sâu:** Chưa đi vào benchmark hoặc pipeline ở slide này.
- **Thời lượng gợi ý:** 20-25 giây.

## Slide 2 — Bài toán thực tế và mục tiêu của đồ án

- **Mục tiêu slide:** Trả lời vì sao đề tài này đáng làm.
- **Nội dung chính nên đưa:**
  - Nhu cầu subtitle song ngữ cho video/audio
  - Chi phí và thời gian lớn nếu làm transcript + dịch + căn thời gian thủ công
  - Mục tiêu của hệ thống là cho người dùng thấy kết quả sớm hơn theo hướng tiến dần
- **Hình ảnh/sơ đồ/bảng nên dùng:** 3 pain points hoặc sơ đồ “input media -> subtitle song ngữ”.
- **Key message:** Giá trị thực tế nằm ở tự động hóa pipeline subtitle song ngữ và giảm thời gian chờ.
- **Không nên nói quá sâu:** Không dùng cụm “live simultaneous interpreting” quá mạnh.
- **Thời lượng gợi ý:** 30-35 giây.

## Slide 3 — Phạm vi và các thành phần chính của hệ thống

- **Mục tiêu slide:** Chốt rõ hệ thống này gồm những gì và không gồm những gì.
- **Nội dung chính nên đưa:**
  - Đầu vào: media cục bộ hoặc YouTube URL
  - Đầu ra: transcript, bản dịch tiếng Việt, subtitle song ngữ, player
  - Các bề mặt chính: mobile app, backend API, worker, AI engine, dashboard, client-web
  - Ngoài phạm vi: training/fine-tuning mô hình mới, live interpreting tuyệt đối
- **Hình ảnh/sơ đồ/bảng nên dùng:** Bảng “Trong phạm vi / Ngoài phạm vi”.
- **Key message:** Hệ thống đủ lớn để là một platform nhỏ, không chỉ là một script AI đơn lẻ.
- **Không nên nói quá sâu:** Chưa giải thích quan hệ giữa các thành phần ở slide này.
- **Thời lượng gợi ý:** 30-35 giây.

## Slide 4 — Kiến trúc tổng thể hệ thống

- **Mục tiêu slide:** Cho hội đồng một bản đồ tổng thể để hiểu phần còn lại.
- **Nội dung chính nên đưa:**
  - Mobile App là user-facing surface chính
  - Backend API là cổng vào trung tâm
  - Backend Worker là lớp validate/ingest trước AI
  - AI Engine là queue-driven ML worker
  - PostgreSQL, Redis/BullMQ, MinIO, Socket là hạ tầng lõi
  - Client-web và dashboard là hai surface phụ trợ
- **Hình ảnh/sơ đồ/bảng nên dùng:** Sơ đồ kiến trúc khối lớn.
- **Key message:** Hệ thống được tách lớp để đảm bảo xử lý media nặng theo kiểu bất đồng bộ nhưng vẫn có trạng thái bền và phản hồi tiến dần.
- **Không nên nói quá sâu:** Không liệt kê chi tiết từng endpoint hoặc từng file.
- **Thời lượng gợi ý:** 65-75 giây.

## Slide 5 — Luồng xử lý end-to-end từ input đến player

- **Mục tiêu slide:** Giải thích runtime flow của hệ thống từ đầu vào đến đầu ra.
- **Nội dung chính nên đưa:**
  - Local upload flow
  - YouTube submit flow
  - Điểm hội tụ ở worker validation
  - Queue sang AI Engine
  - Sinh `chunks/`, `translated_batches/`, `final.json`
  - Mobile theo dõi qua socket và đọc artifact để phát subtitle
- **Hình ảnh/sơ đồ/bảng nên dùng:** Sequence diagram hoặc flowchart runtime.
- **Key message:** Giá trị của đồ án nằm ở việc chuỗi xử lý thực sự đã nối được và chạy được từ đầu vào đến đầu ra.
- **Không nên nói quá sâu:** Không đọc tất cả các bước nhỏ kiểu line-by-line API.
- **Thời lượng gợi ý:** 75-90 giây.

## Slide 6 — Backend orchestration: auth, quota, validation và queue

- **Mục tiêu slide:** Làm rõ vai trò của backend beyond CRUD.
- **Nội dung chính nên đưa:**
  - Auth và session management
  - Subscription/quota gating
  - Presigned upload model
  - Backend Worker như trust boundary
  - Vì sao cần tách `transcription` queue và `ai-processing` queue
- **Hình ảnh/sơ đồ/bảng nên dùng:** Sơ đồ “client -> API -> worker -> AI queue”.
- **Key message:** Backend không chỉ “chuyển request”, mà là lớp kiểm soát quyền, tính hợp lệ của input và điều phối hệ thống.
- **Không nên nói quá sâu:** Không đi quá chi tiết vào JWT/OTP internals.
- **Thời lượng gợi ý:** 65-80 giây.

## Slide 7 — Pipeline AI thực tế trong code

- **Mục tiêu slide:** Giải thích phần ML đủ sâu về logic hệ thống.
- **Nội dung chính nên đưa:**
  - Audio prep, inspection, VAD
  - ASR routing theo ngôn ngữ
  - Distil-Whisper cho English, SenseVoice Small cho Chinese
  - NMT là base translation runtime
  - Phonetic, alignment
  - `during_asr` và `after_asr`
  - Trust gate cho transcript Chinese
  - Translation finalization là lớp hậu xử lý có điều kiện
- **Hình ảnh/sơ đồ/bảng nên dùng:** Sơ đồ pipeline AI một chiều.
- **Key message:** Hệ thống AI hiện tại là một pipeline nhiều thành phần ghép lại, không phải một mô hình duy nhất xử lý toàn bộ.
- **Không nên nói quá sâu:** Không biến slide thành seminar kiến trúc model.
- **Thời lượng gợi ý:** 85-100 giây.

## Slide 8 — Artifact tiến dần và cơ chế realtime

- **Mục tiêu slide:** Làm nổi bật đóng góp hệ thống ở tầng dữ liệu và đồng bộ.
- **Nội dung chính nên đưa:**
  - `chunks/` là transcript sớm
  - `translated_batches/` là subtitle đã dịch từng phần
  - `final.json` là output chuẩn cuối
  - Redis events -> backend socket mirror -> mobile
  - Artifact inventory giúp reconnect-safe playback
  - Player có thể hydrate từ batch trước khi có final
- **Hình ảnh/sơ đồ/bảng nên dùng:** Cây artifact + sơ đồ event/data flow.
- **Key message:** Artifact model là nền tảng để hệ thống vừa realtime hơn, vừa bền vững hơn, vừa dễ benchmark hơn.
- **Không nên nói quá sâu:** Không đọc schema JSON chi tiết từng field.
- **Thời lượng gợi ý:** 60-70 giây.

## Slide 9 — Trải nghiệm phía người dùng và các bề mặt phụ trợ

- **Mục tiêu slide:** Nối kiến trúc backend với giá trị sử dụng thực tế.
- **Nội dung chính nên đưa:**
  - Processing screen
  - Player subtitle song ngữ
  - Lookup, Explain, Word Bank
  - Subscription screen trên mobile
  - Billing handoff sang client-web
  - Dashboard cho admin/operator
- **Hình ảnh/sơ đồ/bảng nên dùng:** 2-3 screenshot thật của app/web/dashboard.
- **Key message:** Hệ thống hiện tại không chỉ sinh subtitle, mà đã có các bề mặt tiêu thụ, quản lý và vận hành xung quanh subtitle pipeline.
- **Không nên nói quá sâu:** Không dành nhiều thời gian cho UI styling.
- **Thời lượng gợi ý:** 45-55 giây.

## Slide 10 — Thiết lập benchmark Chương 3

- **Mục tiêu slide:** Giải thích benchmark đo cái gì và đo như thế nào.
- **Nội dung chính nên đưa:**
  - 20 case YouTube
  - 10 English, 10 Chinese
  - Target language là tiếng Việt
  - Các nhóm metric: latency, first chunk, first batch, WER/CER, artifact completeness
  - Caveat: timing là polling-observed
- **Hình ảnh/sơ đồ/bảng nên dùng:** Bảng dataset + metric.
- **Key message:** Benchmark đang đo tính hoàn chỉnh của pipeline và chất lượng transcript nguồn, không chỉ là demo cảm tính.
- **Không nên nói quá sâu:** Không đi từng case ở slide này.
- **Thời lượng gợi ý:** 35-45 giây.

## Slide 11 — Kết quả benchmark và diễn giải kỹ thuật

- **Mục tiêu slide:** Dùng số liệu để giải thích trạng thái kỹ thuật hiện tại của hệ thống.
- **Nội dung chính nên đưa:**
  - `20/20` completed
  - Avg latency toàn bộ
  - Avg first chunk / first translated batch
  - English vs Chinese
  - WER/CER khác biệt
  - English giữ `during_asr`, Chinese bị kéo về `after_asr`
  - Trust gate active ở Chinese
- **Hình ảnh/sơ đồ/bảng nên dùng:** 1 bảng runtime + 1 bảng WER/CER/policy.
- **Key message:** Benchmark không chỉ cho thấy hệ thống chạy được, mà còn cho thấy rõ trade-off kỹ thuật hiện tại, đặc biệt ở Chinese path.
- **Không nên nói quá sâu:** Không sa đà vào mọi case outlier nếu không bị hỏi.
- **Thời lượng gợi ý:** 70-85 giây.

## Slide 12 — Đóng góp kỹ thuật của đồ án

- **Mục tiêu slide:** Chốt rõ nhóm đã xây được gì về mặt kỹ thuật.
- **Nội dung chính nên đưa:**
  - Hệ thống subtitle song ngữ end-to-end
  - Kiến trúc queue + worker + AI engine
  - Artifact tiến dần bền trên MinIO
  - Player đọc được output trung gian và final
  - Routing và trust gate cho Chinese
  - Billing/admin surfaces để hệ thống gần với sản phẩm hơn
- **Hình ảnh/sơ đồ/bảng nên dùng:** Bảng “Đóng góp / Ý nghĩa”.
- **Key message:** Đóng góp chính là tích hợp hệ thống và đưa pipeline ML vào một ứng dụng hoàn chỉnh, không phải đề xuất thuật toán mới.
- **Không nên nói quá sâu:** Không overclaim thành đóng góp nghiên cứu mô hình.
- **Thời lượng gợi ý:** 45-55 giây.

## Slide 13 — Hạn chế hiện tại, hướng phát triển và kết luận

- **Mục tiêu slide:** Chủ động nói rõ giới hạn và kết thúc mạch trình bày.
- **Nội dung chính nên đưa:**
  - Chưa phải live simultaneous interpreting
  - Chinese path còn là điểm yếu
  - Timing benchmark là polling-observed
  - Translation quality đích chưa có manual review hoàn chỉnh
  - Hướng tiếp theo: Chinese route, latency, translation evaluation, scale
- **Hình ảnh/sơ đồ/bảng nên dùng:** 2 cột “Hạn chế / Hướng phát triển”.
- **Key message:** Hệ thống đã có nền tảng kỹ thuật mạnh và benchmark trung thực, nhưng vẫn còn các điểm cần cải thiện rõ ràng.
- **Không nên nói quá sâu:** Không biến slide cuối thành danh sách roadmap quá dài.
- **Thời lượng gợi ý:** 60-70 giây.

## Gợi ý phân bổ thời gian tổng thể

| Nhóm slide | Thời lượng gợi ý |
| --- | ---: |
| Slide 1-3 | 1.5 phút |
| Slide 4-8 | 6 phút |
| Slide 9-11 | 3 phút |
| Slide 12-13 | 1.5-2 phút |

## Những slide nên nói sâu nhất

1. Slide 5 — Luồng xử lý end-to-end
2. Slide 6 — Backend orchestration
3. Slide 7 — AI pipeline thực tế
4. Slide 11 — Benchmark và diễn giải kỹ thuật

## Những slide nên nói ngắn, dứt khoát

1. Slide 1 — Giới thiệu
2. Slide 2 — Bài toán
3. Slide 3 — Phạm vi
4. Slide 10 — Thiết lập benchmark

## Gợi ý hình ảnh cần chuẩn bị thêm

- Screenshot processing screen
- Screenshot player đang hiển thị subtitle song ngữ
- Sơ đồ kiến trúc tổng thể
- Sơ đồ AI pipeline
- 1 bảng benchmark rút gọn
- Nếu có thể, 1 screenshot client-web subscription hoặc dashboard monitoring để chứng minh hệ thống không chỉ có mobile
