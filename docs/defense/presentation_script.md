# Script thuyết trình chi tiết theo cấu trúc 13 slide

Tài liệu này viết lại script theo hướng:

- tối đa `13 slide`
- ưu tiên **kỹ thuật hệ thống**
- phân bổ thời lượng **không đều**
- slide nào chứa kiến trúc, logic, flow và công nghệ quan trọng thì script dài hơn rõ rệt

## Slide 1 — Đề tài và cách định vị

**Thời lượng gợi ý:** 20-25 giây

“Em xin chào hội đồng. Đề tài của em là *Phát triển ứng dụng phiên dịch và tạo phụ đề song ngữ thời gian thực cho video/audio sử dụng Machine Learning*.”

“Ngay từ đầu em xin định vị rõ: đây là đồ án phát triển **hệ thống phần mềm end-to-end có tích hợp Machine Learning**. Mục tiêu chính của em không phải là nghiên cứu hay huấn luyện ra một mô hình mới, mà là xây dựng một pipeline hoàn chỉnh từ input media cho đến output phụ đề song ngữ và trải nghiệm người dùng có thể sử dụng được.”

## Slide 2 — Bài toán thực tế và mục tiêu của đồ án

**Thời lượng gợi ý:** 30-35 giây

“Bài toán thực tế xuất phát từ nhu cầu xem video hoặc audio đa ngôn ngữ. Nếu làm thủ công thì quy trình transcript, dịch, căn thời gian và đưa vào player khá tốn thời gian.”

“Vì vậy, mục tiêu của hệ thống là tự động hóa càng nhiều càng tốt chuỗi xử lý đó, đồng thời cho người dùng **thấy được kết quả sớm hơn** thay vì phải đợi toàn bộ job hoàn tất rồi mới xem. Em nhấn mạnh cụm ‘thấy kết quả sớm hơn’ theo hướng xử lý tiến dần, chứ không overclaim đây là live simultaneous interpreting tuyệt đối.”

## Slide 3 — Phạm vi và các thành phần chính của hệ thống

**Thời lượng gợi ý:** 30-35 giây

“Về phạm vi, hệ thống hiện tại nhận hai loại đầu vào chính là media cục bộ và YouTube URL. Đầu ra của hệ thống là transcript, bản dịch tiếng Việt, subtitle song ngữ và player để người dùng theo dõi.”

“Ngoài phần media pipeline, hệ thống còn có các bề mặt hỗ trợ như subscription, billing handoff sang web và admin dashboard. Đồng thời, em cũng xác định rõ những gì đồ án **không làm**: em không claim huấn luyện mới, không claim fine-tuning mới, và cũng không claim đã đạt live interpreting theo nghĩa dịch đồng thời thời gian thực tuyệt đối.”

## Slide 4 — Kiến trúc tổng thể hệ thống

**Thời lượng gợi ý:** 65-75 giây

“Đây là kiến trúc tổng thể của hệ thống. Em sẽ đi từ ngoài vào trong. Ở phía người dùng, bề mặt chính là mobile app. Ngoài ra còn có client-web cho phần pricing, account subscription và billing handoff, và dashboard cho admin hoặc operator.”

“Tất cả các surface đó đều đi vào `Backend API`. Backend API là cổng vào trung tâm, chịu trách nhiệm về auth, subscription, media APIs, billing APIs, admin APIs và các contract trả về cho client. Backend không trực tiếp xử lý AI nặng, mà chỉ điều phối.”

“Sau lớp API, có một `Backend Worker` riêng để làm bước validate và ingest. Đây là điểm rất quan trọng, vì hệ thống không đẩy thẳng mọi media lên AI Engine. Worker sẽ kiểm tra input, đo duration thật, re-check quota, và chỉ khi pass mới tạo job cho AI.”

“Phần xử lý ML nằm ở `AI Engine`. Đây là Python worker tiêu thụ queue, download audio từ MinIO, chạy pipeline subtitle rồi upload artifacts trở lại. Song song với đó, trạng thái được cập nhật vào PostgreSQL, event được phát qua Redis, và backend socket layer sẽ mirror các event đó về mobile.”

“Tóm lại, kiến trúc này được tách lớp để giải quyết ba bài toán cùng lúc: xử lý media nặng theo kiểu bất đồng bộ, giữ trạng thái bền để client reconnect được, và vẫn cho người dùng cảm giác hệ thống đang tiến dần thay vì bị treo chờ.”

## Slide 5 — Luồng xử lý end-to-end từ input đến player

**Thời lượng gợi ý:** 75-90 giây

“Ở slide này em muốn giải thích rõ luồng runtime của hệ thống, vì theo em đây là phần quan trọng nhất để hiểu đồ án.”

“Nếu đầu vào là file cục bộ, mobile app sẽ gọi backend để xin presigned URL, sau đó upload file trực tiếp lên MinIO. Sau khi upload xong, app gọi `confirm upload`, lúc đó backend mới tạo `MediaItem` và đẩy job đầu tiên vào queue.”

“Nếu đầu vào là YouTube URL thì khác một chút. Mobile không upload file nào cả, mà chỉ submit URL. Backend tạo `MediaItem` ở trạng thái chờ, rồi backend worker sẽ chịu trách nhiệm dùng `yt-dlp` để lấy metadata, kiểm tra duration, tải audio về và upload audio đó vào raw bucket.”

“Hai đường vào này khác nhau ở bước ingest ban đầu, nhưng sau đó sẽ hội tụ tại backend worker. Worker chuyển trạng thái sang `VALIDATING`, tính duration thật, kiểm tra quota dựa trên duration thật, rồi mới enqueue sang `ai-processing`. Đây là chỗ giúp hệ thống không lãng phí tài nguyên GPU cho các input không hợp lệ.”

“Khi AI Engine nhận job, nó download audio, chạy pipeline xử lý, và trong quá trình đó không đợi đến cuối mới sinh output. Nó tạo `chunks`, rồi `translated_batches`, rồi cuối cùng mới có `final.json`. Trong lúc đó, Redis phát các event tiến độ, backend socket layer nhận event và đẩy sang mobile. Vì vậy processing screen có thể cập nhật progress theo thời gian tiến dần.”

“Ở phía player, nếu đã có `final.json` thì player dùng final output. Nếu chưa có final nhưng đã có translated batches thì player vẫn có thể hydrate dữ liệu từ các batch đã dịch. Đây là lý do em gọi hệ thống là progressive asynchronous subtitle pipeline: người dùng có thể tiếp cận kết quả sớm hơn, nhưng không có nghĩa là toàn bộ nội dung được dịch đồng thời theo nghĩa live tuyệt đối.”

## Slide 6 — Backend orchestration: auth, quota, validation và queue

**Thời lượng gợi ý:** 65-80 giây

“Nếu chỉ nhìn bề ngoài thì dễ nghĩ backend chỉ có vai trò nhận request và trả response. Nhưng trong hệ thống này, backend là lớp orchestration rất quan trọng.”

“Thứ nhất là `auth` và `session`. Backend hiện quản lý registration, OTP verification, login, refresh token, logout, forgot password và reset password. Nghĩa là toàn bộ surface của hệ thống, từ mobile đến dashboard và client-web, đều dựa trên cùng một auth authority ở backend.”

“Thứ hai là `subscription` và `quota gating`. Trước khi cho phép user upload hoặc submit YouTube, backend kiểm tra trạng thái gói và quota hiện tại. Nhưng backend không chỉ check một lần ở API. Sau đó backend worker còn check lại lần nữa sau khi biết duration thật của media. Tức là quota enforcement của hệ thống đang được thiết kế theo nhiều lớp, chứ không dựa vào frontend.”

“Thứ ba là `presigned upload model`. Hệ thống không upload raw media qua body của NestJS API. Backend chỉ cấp presigned URL để client upload trực tiếp lên MinIO. Cách này giảm tải cho API server và hợp lý hơn với file media lớn.”

“Thứ tư là vai trò của `Backend Worker`. Theo em đây là một quyết định kiến trúc tốt: worker đóng vai trò trust boundary giữa input từ người dùng và AI Engine. Nó chuẩn hóa hai đường vào LOCAL và YOUTUBE, đo duration thật, xử lý lỗi ingest sớm, và chỉ khi nào input sạch thì mới đẩy sang GPU pipeline.”

“Cuối cùng là `queue separation`. Hệ thống dùng hai queue chính là `transcription` và `ai-processing`. Ở đây, `transcription` thực chất là queue validation và ingest của backend worker, còn `ai-processing` mới là queue ML thật của AI Engine. Việc tách như vậy giúp flow dễ kiểm soát hơn, dễ retry hơn, và dễ quan sát hơn khi vận hành.”

## Slide 7 — Pipeline AI thực tế trong code

**Thời lượng gợi ý:** 150-180 giây

“Đây là slide kỹ thuật sâu nhất của em. Điều em muốn nhấn mạnh là hệ thống hiện tại không hoạt động theo kiểu gọi một mô hình duy nhất rồi lấy kết quả, mà là một pipeline nhiều tầng, trong đó mỗi tầng giải quyết một rủi ro khác nhau của bài toán subtitle song ngữ.”

“Khi AI Engine nhận job, audio trước hết được chuẩn hóa, kiểm tra đặc tính và chạy VAD để tách các vùng có tiếng nói. Bước này rất quan trọng vì nó quyết định cách chia lời nói thành các đoạn xử lý. Nếu cắt không tốt ngay từ đầu, transcript sẽ khó ổn định, subtitle sẽ bị vỡ câu hoặc lệch nhịp ở các bước sau.”

“Sau đó hệ thống đi vào bài toán khó hơn: chọn cách nhận dạng phù hợp cho từng media. Với tiếng Anh, hệ thống có một tuyến nhận dạng tối ưu cho English. Với nhóm tiếng Trung, hệ thống ưu tiên tuyến nhận dạng khác. Tuy nhiên, hệ thống không ra quyết định theo một luật cứng kiểu ‘thấy tiếng Trung thì luôn dùng mô hình A’. Thay vào đó, nó kết hợp nhiều tín hiệu: gợi ý từ phía client nếu có, tín hiệu rút ra từ audio, và cả metadata của media như title hoặc tên file. Mục tiêu là giảm khả năng đi sai tuyến nhận dạng ngay từ đầu.”

“Với nội dung nghiêng về nhóm ngôn ngữ tiếng Trung, hệ thống còn có thêm một lớp suy luận trước khi nhận dạng sâu. Lớp này giúp phát hiện những trường hợp mà metadata và tín hiệu âm thanh chưa hoàn toàn thống nhất. Khi đó, thay vì quá tin vào một phán đoán ban đầu còn mơ hồ, pipeline có thể chủ động nghiêng về nhánh xử lý thận trọng hơn. Đây là một quyết định mang tính engineering: ưu tiên tránh đi sai đường từ sớm hơn là chạy nhanh nhưng rủi ro.”

“Sau khi đã chọn được tuyến nhận dạng, hệ thống mới bước vào ASR. Ở đây có một điểm rất quan trọng về mặt kiến trúc: không phải mọi tuyến nhận dạng đều được phép chạy chồng ngay với khâu dịch. Hệ thống phân biệt hai chế độ khởi động dịch là `during_asr` và `after_asr`.”

“`during_asr` có thể hiểu là chế độ dịch chồng lên khi ASR vẫn đang chạy. Nghĩa là transcript vừa được tạo ra theo từng chunk thì nhánh dịch có thể nhận ngay các chunk đó để bắt đầu dịch, gom câu và sinh `translated_batches`. Cách làm này giúp người dùng thấy kết quả sớm hơn, nhưng đổi lại nó chỉ an toàn khi transcript đầu vào đủ ổn định.”

“Ngược lại, `after_asr` là chế độ thận trọng hơn. Hệ thống vẫn cho ASR chạy, vẫn sinh `chunks/`, vẫn cập nhật tiến độ, nhưng nhánh dịch sẽ chờ đến khi transcript đã tương đối hoàn tất rồi mới bắt đầu xử lý tiếp. Nói ngắn gọn, transcript được phép đi trước, còn translation sẽ theo sau. Đổi lại, độ trễ tăng lên, nhưng rủi ro dịch dựa trên transcript còn nhiễu sẽ giảm.”

“Điểm em muốn hội đồng chú ý là việc chọn giữa `during_asr` và `after_asr` không chỉ là một dòng cấu hình. Đó là một quyết định thực thi phụ thuộc vào mức độ tin cậy của tuyến nhận dạng đang dùng. Nếu tuyến đó chưa đủ ổn định cho kiểu chạy chồng, hệ thống sẽ tự chuyển sang cách chạy an toàn hơn. Đây chính là chỗ thể hiện tư duy hệ thống: không tối đa hóa tốc độ trong mọi trường hợp, mà gắn tốc độ với độ tin cậy của đầu vào.”

“Sau khi có transcript, nhánh dịch nền của hệ thống là NMT, cụ thể là NLLB chạy qua CTranslate2. Em muốn nói rõ điều này để tránh hiểu nhầm: hệ thống hiện tại không chạy theo kiểu lấy LLM làm bộ máy dịch chính. LLM nếu có chỉ là lớp bổ sung ở một số khâu có điều kiện. Bộ máy dịch chạy thật, xuyên suốt và có thể benchmark được của hệ thống vẫn là NMT-first pipeline.”

“Ngoài transcript và translation, pipeline còn có các bước làm giàu dữ liệu cho player. Với tiếng Anh, hệ thống sinh IPA. Với tiếng Trung, hệ thống sinh pinyin. Tức là output của AI Engine không chỉ phục vụ mục tiêu hiển thị phụ đề, mà còn phục vụ các chức năng tra cứu và học tập ở phía người dùng.”

“Phần kỹ thuật đặc trưng nhất của pipeline hiện tại là cơ chế `trust gate` cho tiếng Trung. Vấn đề mà nhóm em gặp phải là với nhóm nội dung tiếng Trung, rủi ro transcript bị pha nhiều Latin, bị nghiêng sang dạng phiên âm, hoặc bị đi sai hướng nhận dạng cao hơn tiếng Anh. Nếu cứ công bố transcript ngay khi vừa nhận được, những sai lệch này sẽ lan thẳng xuống bản dịch và trải nghiệm player.”

“Vì vậy, nhóm em triển khai một lớp kiểm định độ tin cậy transcript riêng cho nhánh tiếng Trung. Lớp này trả lời hai câu hỏi rất thực dụng. Câu hỏi thứ nhất là: transcript hiện tại có thực sự mang đặc trưng của Chinese-family content hay không. Câu hỏi thứ hai là: kể cả đúng ngôn ngữ rồi, transcript đó đã đủ sạch để công bố ra ngoài hay chưa.”

“Để trả lời hai câu hỏi đó, hệ thống không nhìn vào một chỉ dấu đơn lẻ. Nó xem transcript có giữ được đặc trưng chữ Hán hay không, phần đầu transcript có ổn định hay không, có đang bị lệch nhiều sang chữ Latin hoặc dạng phiên âm hay không, mức độ tự tin của ASR ra sao, câu chữ có lặp lại bất thường hay không, và phân bố văn bản theo thời lượng có hợp lý không. Nói một cách ngắn gọn, hệ thống vừa kiểm tra ‘đúng ngôn ngữ chưa’, vừa kiểm tra ‘đủ sạch để phát hành chưa’.”

“Nếu transcript vượt qua lớp kiểm định này, pipeline đi tiếp bình thường. Nếu chưa đạt, hệ thống không vội công bố. Thay vào đó, nó chuyển sang một nhánh phục hồi: thử lại các hướng nhận dạng thay thế, chuẩn hóa transcript, so sánh chất lượng theo từng vùng thời gian, rồi sửa các vùng xấu trước khi cho đi tiếp. Trong trường hợp xấu nhất, nếu sau các vòng phục hồi mà transcript vẫn không đủ tin cậy, hệ thống chấp nhận fail theo hướng an toàn thay vì xuất ra một bản transcript sai nhưng trông có vẻ hoàn chỉnh.”

“Đây là ý em muốn nhấn mạnh nhất ở slide này: `trust gate` không phải là một bước hậu kiểm chỉ để ghi log. Nó can thiệp trực tiếp vào cách pipeline vận hành, vào việc có công bố kết quả sớm hay không, và thậm chí vào việc có nên cho nhánh dịch chạy chồng ngay từ đầu hay phải chuyển sang cách xử lý bảo thủ hơn.”

“Tóm lại, pipeline AI hiện tại gồm các lớp: chuẩn hóa audio, phát hiện vùng nói, định hướng ngôn ngữ nguồn, chọn tuyến nhận dạng, quyết định thời điểm khởi động dịch, dịch nền bằng NMT, làm giàu phonetic/alignment và kiểm định độ tin cậy cho tiếng Trung trước khi xuất artifact cuối. Theo em, đây là cách nên trình bày đồ án này: một hệ thống ML pipeline được thiết kế để vận hành sản phẩm, chứ không phải một bài demo của riêng một mô hình.”

## Slide 8 — Artifact tiến dần và cơ chế realtime

**Thời lượng gợi ý:** 60-70 giây

“Một điểm mà em nghĩ là khá mạnh của hệ thống hiện tại là thiết kế artifact theo ba tầng: `chunks`, `translated_batches` và `final.json`.”

“`chunks` là transcript sớm xuất hiện sau ASR. `translated_batches` là các cụm subtitle đã dịch xong và có thể dùng tạm cho player. `final.json` là output chuẩn cuối cùng, bao gồm metadata pipeline và toàn bộ segments theo thứ tự canonical.”

“Vì sao em cho rằng thiết kế này quan trọng? Nếu hệ thống chỉ dùng socket để bắn dữ liệu tạm thời, khi client mất kết nối thì rất khó phục hồi. Còn nếu hệ thống chỉ chờ đến cuối rồi mới sinh một file final, người dùng sẽ phải đợi quá lâu. Artifact model hiện tại dung hòa được cả hai: có output sớm để hiển thị tiến dần, nhưng đồng thời vẫn có object storage bền để reconnect-safe.”

“Ở tầng event, AI Engine publish `progress`, `chunk_ready`, `batch_ready`, `completed`, `failed` qua Redis. Backend socket layer không tự tạo business state mới, mà chủ yếu mirror các event đó sang mobile, đồng thời refresh `artifactSummary` cache trong database. Nhờ vậy, mobile vừa có realtime update, vừa có status API và artifact inventory làm điểm tựa bền.”

“Đây cũng là lý do player có thể hydrate từ `translated_batches` trước khi `final.json` xuất hiện. Em nghĩ đây là một đóng góp ở mức hệ thống, vì nó ảnh hưởng trực tiếp tới UX chứ không chỉ là chuyện lưu file.”

## Slide 9 — Trải nghiệm phía người dùng và các bề mặt phụ trợ

**Thời lượng gợi ý:** 45-55 giây

“Sau khi nói về backend và AI pipeline, em muốn quay lại góc nhìn người dùng để thấy kỹ thuật đó được tiêu thụ như thế nào.”

“Ở mobile app, người dùng có processing screen để theo dõi progress và current step. Khi đã có translated output, người dùng có thể sang player. Trong player, ngoài subtitle song ngữ, hệ thống còn hỗ trợ phonetic, lookup, Explain và word bank. Điều này cho thấy output của pipeline không chỉ để xem, mà còn được dùng để tương tác và học.”

“Ngoài mobile, hệ thống còn có `client-web` cho pricing, account subscription và luồng billing handoff từ mobile sang web. Song song, còn có `dashboard` dành cho admin để xem overview, users, plans, AI Explain analytics và monitoring các phần như queue, failures, translation finalization.”

“Điểm em muốn chốt ở slide này là: hệ thống hiện tại không chỉ sinh subtitle rồi dừng ở đó. Nó đã có các surface tiêu thụ và vận hành xung quanh subtitle pipeline.”

## Slide 10 — Thiết lập benchmark Chương 3

**Thời lượng gợi ý:** 35-45 giây

“Để đánh giá hệ thống, em dùng package benchmark mới nhất được export từ một run đã lưu. Bộ benchmark gồm 20 case YouTube, trong đó có 10 English và 10 Chinese, đích dịch đều là tiếng Việt.”

“Các nhóm metric chính gồm: latency end-to-end, thời điểm xuất hiện first chunk và first translated batch, artifact completeness, WER và CER cho transcript nguồn. Em cũng muốn nói rõ một caveat kỹ thuật: các mốc thời gian trong benchmark hiện tại là `polling-observed`, tức là được suy ra từ backend status polling, không phải timestamp tuyệt đối của socket hay client.”

“Vì vậy, benchmark này phù hợp để đánh giá pipeline ở mức hệ thống, nhưng không nên diễn giải như đo event delivery time một cách tuyệt đối.”

## Slide 11 — Kết quả benchmark và diễn giải kỹ thuật

**Thời lượng gợi ý:** 100-130 giây

“Kết quả tổng quan đầu tiên là: cả 20 trên 20 case đều hoàn thành. Đây là một tín hiệu tốt vì nó cho thấy pipeline end-to-end hiện tại chạy ổn định ở mức benchmark này.”

“Về hiệu năng, độ trễ trung bình toàn bộ là khoảng 143.27 giây. First chunk trung bình khoảng 69 giây, còn first translated batch khoảng 76 giây. Đồng thời, 18 trên 20 case có dấu hiệu tạo artifact tiến dần trước khi final hoàn tất. Điều này phù hợp với thiết kế artifact mà em vừa trình bày.”

“Nếu tách theo họ ngôn ngữ thì English tốt hơn rõ rệt. English có latency trung bình khoảng 125 giây, WER trung bình 0.036 và CER 0.021. Trong khi đó Chinese có latency trung bình khoảng 161 giây, WER trung bình 0.247 và CER 0.181.”

“Theo em, điều quan trọng nhất ở slide này là không đọc con số theo kiểu tách rời khỏi runtime. Nếu chỉ nói English tốt hơn Chinese thì đúng, nhưng chưa đủ. Điều cần làm là giải thích vì sao benchmark lại ra hình dạng như vậy, và hình dạng đó có khớp với policy trong code hay không.”

“Với English path, kết quả benchmark cho thấy hệ thống giữ được cách xử lý tích cực hơn. Transcript có thể được đưa sang nhánh dịch sớm, nên khoảng cách giữa `first chunk` và `first translated batch` khá ngắn. Điều đó phù hợp với mục tiêu của `during_asr`: tạo cảm giác pipeline đang tiến dần thật sự, chứ không phải đợi toàn bộ job xong mới bắt đầu sinh giá trị cho người dùng.”

“Ngược lại, với Chinese path, pipeline hiện tại đi theo hướng thận trọng hơn. Transcript có thể vẫn xuất hiện sớm ở mức artifact trung gian, nhưng nhánh dịch thường không được đẩy lên sớm như English. Lý do không phải chỉ vì tốc độ mô hình, mà vì toàn bộ nhánh xử lý tiếng Trung đang được thiết kế để ưu tiên độ tin cậy của transcript trước. Khi hệ thống phát hiện đây là trường hợp có rủi ro cao hơn, nó sẵn sàng hoãn translation để tránh lan sai số xuống tầng subtitle song ngữ.”

“Vì vậy, chênh lệch latency giữa English và Chinese nên được diễn giải như một hệ quả của chính sách runtime, chứ không chỉ như một con số hiệu năng thuần túy. English path trưởng thành hơn nên được phép overlap nhiều hơn. Chinese path đang bảo thủ hơn nên trả giá bằng độ trễ lớn hơn. Đổi lại, pipeline có cơ chế bảo vệ chất lượng rõ ràng hơn trong các case khó.”

“Từ góc nhìn WER/CER, em cũng muốn nói thẳng là Chinese hiện vẫn yếu hơn English. Nhưng em không diễn giải điều đó theo cách đơn giản rằng ‘mô hình tiếng Trung tệ hơn’. Hợp lý hơn là xem đây là tổng hợp của nhiều yếu tố: độ khó của dữ liệu đầu vào, độ ổn định của transcript, tuyến nhận dạng đang dùng, và việc pipeline tiếng Trung hiện được triển khai theo hướng an toàn hơn. Tức là benchmark ở đây đang phản ánh cả chất lượng nhận dạng lẫn triết lý vận hành của hệ thống.”

“Một cách nói chuyên nghiệp và an toàn trước hội đồng là: benchmark cho thấy English path hiện đạt mức trưởng thành cao hơn Chinese path cả về chất lượng transcript lẫn khả năng tạo output sớm. Đồng thời, benchmark cũng xác nhận rằng các quyết định kiến trúc trong pipeline, đặc biệt là thời điểm khởi động dịch và cơ chế kiểm định transcript tiếng Trung, đang có tác động đo được lên hành vi hệ thống.”

“Vì vậy, khi em trình bày kết quả benchmark, em không chỉ muốn hội đồng nhìn vào ba con số `latency`, `WER`, `CER`, mà muốn hội đồng thấy rằng những con số đó gắn trực tiếp với thiết kế hệ thống. Đây là điểm mạnh của đồ án theo hướng engineering: số liệu không đứng riêng, mà được nối ngược trở lại thành lý do kiến trúc.”

## Slide 12 — Đóng góp kỹ thuật của đồ án

**Thời lượng gợi ý:** 45-55 giây

“Nếu chốt lại ở góc độ kỹ thuật, em nghĩ đồ án có bốn đóng góp chính.”

“Thứ nhất, xây dựng được một hệ thống subtitle song ngữ end-to-end, từ ingest media cho đến player. Thứ hai, thiết kế được kiến trúc bất đồng bộ tách rõ API, worker và AI Engine thay vì dồn mọi thứ vào một service. Thứ ba, xây được artifact model tiến dần gồm `chunks`, `translated_batches` và `final.json`, giúp hệ thống vừa có realtime hơn, vừa có dữ liệu bền hơn.”

“Thứ tư, hệ thống đã có các lớp bổ trợ đủ để giống một sản phẩm hơn là một demo ML thuần túy, ví dụ subscription/quota, billing handoff, lookup, Explain, word bank và admin monitoring.”

“Nói ngắn gọn, đóng góp chính của đồ án không phải là đề xuất một thuật toán mới, mà là đưa nhiều thành phần kỹ thuật khác nhau vào một hệ thống hoàn chỉnh và vận hành được.”

## Slide 13 — Hạn chế hiện tại, hướng phát triển và kết luận

**Thời lượng gợi ý:** 60-70 giây

“Em muốn kết thúc bằng cách nói thẳng về giới hạn hiện tại của hệ thống. Thứ nhất, em không cho rằng hệ thống này nên được gọi là live simultaneous interpreting. Cách diễn đạt đúng hơn là subtitle generation theo hướng tiến dần trên pipeline bất đồng bộ.”

“Thứ hai, Chinese path hiện vẫn là điểm yếu rõ nhất. WER/CER cao hơn, policy thận trọng hơn, và trade-off giữa độ tin cậy và độ sớm của output vẫn còn lớn. Thứ ba, timing benchmark hiện là polling-observed nên có giá trị so sánh hệ thống, nhưng không nên bị diễn giải quá tuyệt đối.”

“Thứ tư, phần đánh giá chất lượng bản dịch tiếng Việt hiện chưa hoàn chỉnh như phần đánh giá transcript nguồn. Đây là điểm nếu làm tiếp em sẽ ưu tiên bổ sung.”

“Hướng phát triển theo em gồm ba nhóm: cải thiện Chinese route và policy, tối ưu thêm latency của pipeline, và hoàn thiện evaluation cho translation quality. Dù vậy, ở trạng thái hiện tại, em cho rằng đồ án đã chứng minh được năng lực xây dựng một hệ thống phần mềm tích hợp Machine Learning có kiến trúc rõ, có pipeline chạy được, có benchmark và có sản phẩm để người dùng thực sự tương tác.”

“Em xin kết thúc phần trình bày ở đây. Sau đây em sẵn sàng trả lời các câu hỏi phản biện của hội đồng.”

## Ghi chú đào sâu cho người thuyết trình

Phần dưới đây không nhất thiết phải nói hết trên slide. Mục đích là để bạn đọc và nắm logic hệ thống sâu hơn, sau đó tự chọn mức độ nói phù hợp với thời gian bảo vệ.

### 1. Cách giải thích ngắn gọn nhưng đúng về `during_asr` và `after_asr`

Có ba tầng nên phân biệt rõ:

- Tầng ý tưởng: `during_asr` là cố gắng cho dịch chạy chồng lên khi ASR vẫn đang sinh transcript; `after_asr` là đợi ASR xong rồi mới dịch.
- Tầng code: policy người dùng muốn chưa chắc là policy chạy thật. Router có thể auto-downgrade nếu route chưa được `during_asr_certified`.
- Tầng benchmark: nếu effective policy là `during_asr` thì first translated batch thường đến sớm hơn; nếu là `after_asr` thì first chunk có thể vẫn xuất hiện nhưng translation bị trễ hơn.

Nếu cần nói một câu rất ngắn:

“`during_asr` là cho transcript đi sang nhánh dịch ngay khi ASR còn đang chạy. `after_asr` là để transcript hoàn thiện hơn rồi mới dịch. Hệ thống không áp dụng một cách máy móc, mà chọn cách nào an toàn hơn cho từng nhánh xử lý.”

### 2. Cách giải thích sâu hơn về `during_asr` ở mức runtime

Nếu hội đồng hỏi sâu hơn, bạn có thể diễn đạt như sau:

“Ở `during_asr`, nhánh nhận dạng và nhánh dịch chạy theo kiểu gối đầu. Mỗi khi ASR tạo được một phần transcript đủ dùng, phần đó được đưa ngay sang bộ gom câu và bộ dịch. Hệ thống vẫn đặt cơ chế kiểm soát để nhánh nhận dạng không chạy vượt quá xa so với nhánh dịch. Nói cách khác, đây không phải là chạy song song vô điều kiện, mà là overlap có điều tiết.”

Điểm nên nhớ:

- `during_asr` không phải streaming token-by-token.
- Nó là overlap theo chunk/batch ở mức pipeline.
- Đây là lý do tài liệu nên dùng cách diễn đạt “progressive asynchronous processing”, không nên nói “simultaneous interpreting”.

### 3. Cách giải thích sâu hơn về `after_asr`

“`after_asr` không có nghĩa là hệ thống đứng yên. Transcript vẫn được tạo dần, tiến độ vẫn cập nhật, artifact trung gian vẫn có thể xuất hiện. Khác biệt là bản dịch chưa được công bố sớm, vì pipeline muốn chờ transcript ổn định hơn rồi mới dịch. Đây là cách đánh đổi latency để giảm rủi ro sai dây chuyền.”

Điểm này rất quan trọng vì nếu nói không kỹ, hội đồng có thể hiểu sai rằng `after_asr` là mất toàn bộ tính progressive. Thực ra không phải:

- Progressive ở tầng transcript vẫn tồn tại.
- Chỉ có progressive ở tầng translated subtitle bị giảm hoặc bị hoãn.

### 4. Chính sách yêu cầu và chính sách thực thi thực tế khác nhau như thế nào

Bạn có thể tự ghi nhớ theo công thức:

- Chính sách yêu cầu: cách chạy mà pipeline mong muốn sử dụng.
- Chính sách thực thi thực tế: cách chạy mà hệ thống thực sự cho phép sau khi đánh giá độ an toàn của tuyến nhận dạng.

Ví dụ giải thích tự nhiên:

“Có thể cấu hình chung thiên về `during_asr`, nhưng khi đi vào runtime thật, hệ thống vẫn có quyền chuyển sang `after_asr` nếu thấy tuyến nhận dạng hiện tại chưa đủ ổn định. Nghĩa là ý định ban đầu và cách chạy thực tế không nhất thiết luôn giống nhau.”

### 5. `trust gate` nên được hiểu như thế nào cho dễ nói

Một cách giải thích dễ hiểu:

“Trust gate là lớp kiểm định transcript tiếng Trung ngay trong lúc pipeline đang chạy. Nó giống như một chốt kiểm soát chất lượng động, quyết định xem transcript hiện tại đã đủ tin để công bố và đưa tiếp sang các bước sau hay chưa.”

Bạn có thể nhấn mạnh ba ý:

- Nó không sửa transcript một cách trực tiếp như một model.
- Nó đánh giá xem transcript có đáng tin để publish hoặc dịch tiếp hay không.
- Nếu không đủ tin, nó ép hệ thống thận trọng hơn: block publish sớm, tìm candidate khác, repair hoặc fail-closed.

### 6. Bên trong `trust gate` đang kiểm tra cái gì

Nên nhớ trust gate có hai câu hỏi lớn:

- transcript này có thực sự đi đúng ngữ hệ tiếng Trung hay không?
- transcript này đã đủ sạch và đủ ổn để công bố hay chưa?

Với nhóm kiểm tra “đi đúng ngữ hệ”, bạn có thể kể các tín hiệu tiêu biểu:

- transcript có giữ được đặc trưng chữ Hán hay không
- dấu hiệu ngôn ngữ ở audio và transcript có đang mâu thuẫn nhau không
- phần đầu transcript có đủ ổn định để tin rằng hệ thống đi đúng ngữ hệ hay chưa
- transcript có bị nghiêng quá nhiều sang chữ Latin hoặc dạng phiên âm hay không

Với nhóm kiểm tra “độ sạch của transcript”, bạn có thể kể:

- mức độ tự tin của nhận dạng có đủ không
- transcript có bị lặp hoặc méo câu bất thường không
- mật độ văn bản theo thời lượng có hợp lý không
- có vùng nào biểu hiện nhiễu, pha ngôn ngữ hoặc chất lượng thấp rõ rệt không

Nếu cần nói một câu dễ hiểu:

“Gate vừa hỏi transcript có đúng ngôn ngữ không, vừa hỏi transcript có đủ sạch không.”

### 7. Cách nói chuyên nghiệp về các mức phản ứng của `trust gate`

Đây là phần rất nên hiểu rõ vì nếu nắm được, bạn sẽ trả lời câu hỏi phản biện chắc hơn.

- Mức 1: transcript đủ tốt để công bố.
- Mức 2: transcript có thể đúng hướng nhưng còn một số vùng cần sửa trước khi công bố.
- Mức 3: transcript chưa đủ tin cậy nên phải thử nhánh phục hồi hoặc tuyến nhận dạng thay thế.
- Mức 4: sau các vòng phục hồi mà vẫn không đạt, hệ thống chấp nhận dừng theo hướng an toàn thay vì xuất ra kết quả sai.

Điểm tinh tế:

- Có những trường hợp hệ thống tin là đang đi đúng ngôn ngữ, nhưng vẫn chưa cho công bố ngay vì transcript còn bẩn.
- Có những trường hợp transcript đủ để giữ lại làm nền phục hồi, nhưng chưa đủ để phát hành ra ngoài.
- Tức là pipeline không ra quyết định theo kiểu đạt hoặc trượt đơn giản, mà có các mức xử lý trung gian.

### 8. Recovery của Chinese path thực tế đang làm gì

Khi candidate đầu tiên không tốt, pipeline không dừng ngay. Nó có thể:

- chạy candidate route khác
- normalize transcript Chinese candidate
- profile transcript theo window
- đánh giá lại từng candidate theo tiêu chí tin cậy
- giữ lại candidate nào có cơ sở ngôn ngữ đáng tin hơn
- dùng candidate khác để repair những window bị đánh dấu xấu
- refine lại transcript primary
- đánh giá lại sau khi làm sạch và hợp nhất candidate tốt nhất

Thông điệp kỹ thuật nên nhớ là:

“Chinese path của hệ thống là trust-gated multi-pass pipeline, không phải single-pass transcript rồi publish ngay.”

### 9. Vì sao trust gate có thể làm benchmark nhìn “chậm hơn”

Nếu hội đồng hỏi: “Vậy trust gate có làm hệ thống chậm đi không?” thì câu trả lời hợp lý là có, nhưng đó là chủ đích kiến trúc.

Bạn có thể trả lời:

“Có. Khi lớp kiểm định này bật, hệ thống ưu tiên tránh công bố transcript sai hơn là cố đưa subtitle ra sớm bằng mọi giá. Vì vậy nhánh tiếng Trung có thể phải chờ transcript ổn định hơn, hoặc phải đi qua bước phục hồi trước khi xuất ra ngoài. Điều này làm latency tăng, nhưng đổi lại hệ thống có cơ chế fail-safe rõ ràng hơn.”

### 10. Vì sao `WER` tiếng Trung cao hơn tiếng Anh

Một câu trả lời an toàn:

“Benchmark cho thấy tiếng Trung hiện kém tiếng Anh cả về quality lẫn timing. Em không quy toàn bộ nguyên nhân cho một thành phần duy nhất. Hợp lý hơn là do tổ hợp của route hiện tại, độ khó source, mức độ ổn định transcript và policy runtime đang bảo thủ hơn.”

Điều không nên nói quá đà:

- không nên nói trust gate làm WER cao hơn
- không nên nói chỉ vì model tiếng Trung yếu
- không nên khẳng định đã tìm ra nguyên nhân duy nhất nếu chưa có ablation study

### 11. Cách trả lời nếu bị hỏi: “Vậy trust gate có phải translation policy không?”

Bạn có thể trả lời:

“Không hẳn. Bản chất của nó là cơ chế quản trị chất lượng transcript cho nhánh tiếng Trung. Nhưng vì nó có quyền làm pipeline thận trọng hơn, nên trên thực tế nó ảnh hưởng trực tiếp đến thời điểm subtitle được công bố và nhịp chạy của toàn bộ pipeline.”

### 12. Cách trả lời nếu bị hỏi: “Hệ thống có thật sự realtime không?”

Một cách trả lời vừa an toàn vừa đúng:

“Em không gọi đây là live simultaneous interpreting. Cách mô tả đúng hơn là hệ thống subtitle song ngữ xử lý bất đồng bộ theo kiểu tiến dần. Với một số route như English path, hệ thống có overlap giữa ASR và translation. Nhưng với các path cần thận trọng hơn như Chinese, hệ thống có thể chủ động hạ về `after_asr` để bảo vệ chất lượng.”

## Phụ lục kỹ thuật đào sâu — Trust gate, Chinese path và các thông số thực tế

Phần này viết để bạn học kỹ hệ thống. Không khuyến nghị đọc nguyên văn trên slide. Ở những chỗ cần đối chiếu code, tôi sẽ giữ tên trường hoặc config trong ngoặc backtick, nhưng cách diễn giải vẫn ưu tiên ngôn ngữ hệ thống.

### 1. Trust gate bật trong những trường hợp nào

Trust gate không chạy cho mọi media. Trong code hiện tại, nó chỉ active khi đồng thời thỏa các điều kiện sau:

- Cờ hệ thống `AI_CHINESE_TRUST_GATE_ENABLED=true`.
- Pipeline có đủ cơ sở để xem case hiện tại là nghiêng về Chinese-family content.

Cơ sở “nghiêng về Chinese-family content” có thể đến từ ba hướng:

- `Chinese prior` cho thấy media có khả năng cao là tiếng Trung hoặc tiếng Quảng.
- `selected_source_lang` sau bước hint/probe đã là `zh` hoặc `yue`.
- `probe_source_lang` từ audio probe đã là `zh` hoặc `yue`.

Ý nghĩa thực tế:

- Nếu trust gate chưa active, pipeline có thể đi thẳng theo nhánh ASR -> NMT thông thường.
- Nếu trust gate active, Chinese path sẽ chuyển sang một nhánh bảo thủ hơn: giữ candidate transcript ở trạng thái private, chưa công bố `chunks/` và `translated_batches/` ra ngoài cho đến khi transcript được xác nhận đủ tin cậy.

### 2. Trước khi trust gate chấm transcript, hệ thống đã chuẩn bị ngữ cảnh gì

Trust gate không hoạt động trong chân không. Trước đó pipeline đã dựng một ngữ cảnh định tuyến khá đầy đủ:

- `source_language_hint` từ client hoặc config, nếu có.
- Kết quả `probe` ngôn ngữ từ audio bằng route nhẹ.
- `media_context`, đặc biệt là `title` và tên file/audio key.
- Quyết định chọn route ASR ban đầu.
- Chính sách khởi động dịch mà pipeline đang muốn dùng.

Điều này quan trọng vì trust gate không chỉ nhìn transcript “sạch hay bẩn”, mà còn so transcript với bối cảnh route và bối cảnh ngôn ngữ đã được suy luận trước đó.

### 3. `Chinese prior` được tính như thế nào

`Chinese prior` là lớp suy luận mềm trước trust gate. Nó không quyết định transcript đúng hay sai, nhưng nó quyết định case này có đáng để kích hoạt Chinese trust path hay không.

Hiện tại, điểm prior được cộng như sau:

- Nếu `title` chứa Han characters: cộng `2.5`.
- Nếu `title` chứa các keyword định hướng tiếng Trung như `chinese`, `mandarin`, `pinyin`, `hsk`, `中文`, `汉语`, `普通话`, `粤语`, `相亲`...: cộng tối đa `2.0`.
- Nếu tên file chứa Han characters: cộng `1.5`.
- Nếu tên file chứa keyword định hướng tiếng Trung: cộng tối đa `1.0`.
- Nếu `probe_source_lang` trực tiếp ra `zh` hoặc `yue`: cộng `2.0`.
- Nếu probe giữa English và Chinese quá sát nhau nhưng vẫn có Chinese trong tập điểm: cộng `1.0`.

Các ngưỡng hiện tại:

- `AI_CHINESE_PRIOR_MIN_SCORE=2.0`: từ mức này trở lên, case được coi là đủ cơ sở để kích hoạt trust-gated Chinese handling.
- Điểm từ `4.0` trở lên được coi là “strong”.
- Nếu prior đủ mạnh, pipeline có thể bias route sang nhánh Chinese-family ngay cả khi probe ban đầu còn lưỡng lự hoặc tạm nghiêng về English.

Đây là một cơ chế rất thực dụng: chấp nhận dùng metadata như một soft prior để tránh rơi vào sai lầm “probe ngắn đầu clip nói tiếng Anh nên cả clip bị kéo sang English route”.

### 4. Bản đồ route và policy hiện tại của Chinese path

Ở mức route ASR, logic hiện tại của AI Engine như sau:

- English mặc định đi `distil_whisper_en`.
- English/unknown fallback đi `whisper_turbo`.
- Chinese shipping default hiện tại là `sensevoice_small`.
- Chinese safe fallback hiện tại là `whisper_full`.
- `paraformer_zh` tồn tại như route đánh giá/thay thế nhưng vẫn cần đi qua Chinese trust path.

Ở mức policy dịch, có hai lớp quyết định khác nhau:

- Lớp 1: router quyết định route hiện tại có được phép overlap kiểu `during_asr` hay không. Nếu route chưa được chứng nhận cho overlap thì router tự downgrade sang `after_asr`.
- Lớp 2: nếu trust gate active và `AI_CHINESE_FORCE_AFTER_ASR_ON_RECOVERY=true`, pipeline sẽ cưỡng bức Chinese path sang `after_asr` dù route đó về lý thuyết có thể chạy `during_asr`.

Điểm này rất quan trọng khi giải thích benchmark:

- `after_asr` ở Chinese path không chỉ đến từ “route không đủ nhẹ”.
- Nó còn đến từ quyết định chính sách: khi trust-gated recovery bật, pipeline cố tình chờ transcript ổn định hơn rồi mới cho nhánh dịch đi tiếp.

### 5. Trust gate đang thu thập những tín hiệu nào

Trust gate dựng một gói tín hiệu `TranscriptTrustSignals`. Đây là tập tín hiệu đầu vào mà nó dùng để chấm transcript. Có thể chia thành 5 nhóm.

Nhóm 1: tín hiệu đặc trưng ngôn ngữ ở mức toàn transcript

- Tỷ lệ ký tự Hán toàn transcript (`han_ratio`).
- Tỷ lệ ký tự Hán ở phần đầu transcript (`early_han_ratio`).
- Tỷ lệ ký tự Latin toàn transcript (`latin_ratio`).
- Tỷ lệ token Latin giống pinyin (`pinyin_like_ratio`).

Nhóm 2: tín hiệu chất lượng nhận dạng

- Trung bình `word confidence` của toàn bộ từ (`avg_word_confidence`).
- `avg_logprob` nếu route/provider có cung cấp.
- `compression_ratio` nếu diagnostics có cung cấp.

Lưu ý quan trọng:

- `compression_ratio` hiện được ghi nhận vào `signals` để quan sát và lưu metric.
- Nhưng ở version code hiện tại, nó chưa trực tiếp cộng điểm vào `owner_score` hay `cleanliness_score`.

Nhóm 3: tín hiệu cấu trúc văn bản

- `lexical_diversity`: độ đa dạng từ vựng.
- `repetition_score`: mức độ lặp bất thường.
- `punctuation_density`: mật độ dấu câu.
- `text_density`: số ký tự trên mỗi giây audio.
- `sentence_count`: số câu.
- `total_chars`: tổng số ký tự.

Nhóm 4: tín hiệu đối chiếu với quyết định định tuyến

- Transcript hiện đang đi trên English route hay không (`route_is_english`).
- Có xung đột giữa prior Chinese và English route hay không (`route_mismatch`).
- Probe giữa English và Chinese có đang quá sít nhau không (`probe_near_tie`).
- Probe có ủng hộ Chinese-family hay không (`probe_supports_chinese`).

Nhóm 5: tín hiệu tổng hợp từ window profiler

- `mixed_window_count`: có bao nhiêu window mixed-script.
- `max_window_repetition`: window nào lặp tệ nhất.
- `max_window_latin_ratio`: window nào nghiêng Latin mạnh nhất.

Nhóm này cũng chủ yếu phục vụ trust decision và observability. Nó rất hữu ích khi cần giải thích vì sao trust gate đã yêu cầu repair hoặc recovery.

### 6. Window profiler của Chinese path đang cắt transcript như thế nào

Trước khi trust gate chấm sâu hơn, pipeline dùng `profile_chinese_transcript_windows()` để chia transcript thành các cửa sổ phân tích xác định.

Mỗi câu trước tiên được profile thành:

- `han_ratio` của câu.
- `latin_ratio` của câu.
- `code_switch_density`, hiểu đơn giản là mức độ pha Latin trong phần có ký tự Han/Latin.
- Câu có phải mixed-script hay không.

Sau đó hệ thống gom thành `window` theo các ngưỡng hiện tại:

- Nếu gap giữa hai câu >= `1.0s` thì tách window mới.
- Nếu window hiện tại đã dài >= `18.0s` thì tách.
- Nếu số câu dự kiến vượt `6` thì tách.
- Nếu đã có ít nhất `2` câu và mức code-switch thay đổi đột ngột >= `0.35` thì tách.
- Nếu thêm câu mới làm thời lượng dự kiến vượt `18.0s` thì tách.

Mỗi window sau khi tạo ra sẽ có các metric:

- `start`, `end`, `duration_seconds`.
- `gap_from_previous`.
- `sentence_count`.
- `han_ratio`, `latin_ratio`.
- `code_switch_density`.
- `mixed_script`.
- `lexical_diversity`.
- `repetition_score`.
- `text`.

Ý nghĩa hệ thống:

- Trust gate không chỉ xem transcript như một chuỗi text lớn.
- Nó còn tìm những “vùng xấu” cụ thể theo timeline, để có thể repair có mục tiêu thay vì vứt bỏ toàn bộ candidate.

### 7. Trust gate chấm “đi đúng ngữ hệ” như thế nào

Trust gate tách riêng một điểm mà ta có thể gọi là “điểm nghi ngờ đi sai ngữ hệ”. Trong code hiện tại, điểm này tương ứng với `owner_score`.

Các quy tắc cộng điểm hiện tại là:

- Nếu prior cho rằng case này nên đi Chinese trust path nhưng transcript lại đang ở English route: cộng `1.0`.
- Nếu probe giữa English và Chinese là near tie: cộng thêm `0.35`.
- Nếu probe có ủng hộ Chinese, route hiện tại lại là English, đồng thời transcript thực tế có quá ít Han characters: cộng `1.1`.
- Nếu tỷ lệ Han toàn transcript thấp hơn `0.12`: cộng `1.0`.
- Nếu tỷ lệ Han ở phần đầu transcript thấp hơn `0.08`: cộng `0.8`.
- Nếu transcript có quá nhiều token Latin trông như pinyin, vượt ngưỡng `0.45`: cộng `0.6`.

Ngưỡng quan trọng:

- `AI_CHINESE_TRUST_OWNER_SUSPICIOUS_SCORE=1.6`.

Nghĩa là:

- Chỉ cần transcript vừa đi sai route, vừa thiếu đặc trưng chữ Hán, hoặc có xung đột rõ giữa probe và transcript, nó đã đủ để rơi vào nhánh recovery.

### 8. Trust gate chấm “độ sạch transcript” như thế nào

Song song với “đi đúng ngữ hệ”, trust gate còn có một điểm “độ bẩn / độ méo của transcript”. Trong code hiện tại, điểm này tương ứng với `cleanliness_score`.

Các quy tắc cộng điểm hiện tại là:

- Nếu `avg_logprob < -0.75`: cộng `0.8`.
- Nếu `avg_word_confidence < 0.45`: cộng `0.5`.
- Nếu `lexical_diversity < 0.22`: cộng `0.5`.
- Nếu `text_density` nằm ngoài khoảng `[0.8, 18.0]`: cộng `0.4`.
- Nếu `punctuation_density > 0.3`: cộng `0.3`.

Ý nghĩa của từng nhóm:

- `avg_logprob` và `avg_word_confidence` phản ánh độ tự tin của ASR.
- `lexical_diversity` giúp phát hiện transcript nghèo nội dung, dễ bị lặp.
- `text_density` giúp phát hiện transcript quá rỗng hoặc quá dày bất thường so với độ dài audio.
- `punctuation_density` giúp phát hiện transcript nhiều ký hiệu, dấu câu hoặc nhiễu hình thức không tự nhiên.

Ngưỡng quan trọng:

- `AI_CHINESE_TRUST_REPAIR_SCORE=0.9`.

Nghĩa là:

- Có những transcript không bị coi là đi sai ngữ hệ, nhưng vẫn chưa đủ sạch để publish.
- Với các transcript kiểu này, pipeline ưu tiên repair thay vì đổi route ngay.

### 9. Window-level penalties được áp như thế nào

Ngoài điểm toàn transcript, trust gate còn duyệt từng window để tìm vùng nào cần repair.

Quy tắc hiện tại:

- Mỗi window có một ngưỡng lặp `repetition_limit`.
- Mặc định `repetition_limit = 0.22`.
- Nếu window là mixed-script, ngưỡng này được nới gấp đôi thành `0.44`.

Nếu `repetition_score` của window vượt ngưỡng:

- `cleanliness_score` cộng thêm `0.6`.
- Window đó bị đánh dấu vào `repair_window_indexes`.

Ngoài ra còn một luật kiểm tra “Latin-heavy window”:

- Nếu window không phải mixed-script.
- Nếu `latin_ratio > 0.55`.
- Nếu probe lại đang ủng hộ Chinese-family.

Thì:

- `cleanliness_score` cộng thêm `0.4`.
- Window đó cũng bị đánh dấu để repair.

Có một ngoại lệ đáng chú ý:

- Nếu window là mixed-script, có `code_switch_density >= 0.35`, `latin_ratio > 0.25`, nhưng không bị lặp quá mức, pipeline cho rằng đó có thể là mixed-language hợp lệ nên bỏ qua phạt “latin-heavy”.

Đây là một điểm thiết kế tốt:

- Hệ thống cố phân biệt giữa “mixed-language thực sự có nghĩa” với “transcript bị lệch sang Latin một cách bất thường”.

### 10. Trust gate ra verdict như thế nào

Sau khi có `owner_score` và `cleanliness_score`, trust gate tạo `suspicious_score = owner_score + cleanliness_score`, nhưng quyết định cuối cùng không chỉ nhìn tổng điểm mà nhìn theo thứ tự ưu tiên.

Luật hiện tại:

- Nếu đang ở `final_recovery` và `owner_score >= 1.6` thì verdict là `untrusted_fail`.
- Nếu chưa phải final recovery nhưng `owner_score >= 1.6` thì verdict là `suspicious_recover`.
- Nếu ownership chưa đến mức fail nhưng `cleanliness_score >= 0.9` thì verdict là `trusted_repair`.
- Còn lại là `trusted`.

Ý nghĩa:

- `suspicious_recover`: nghi ownership, nên ưu tiên thử route/candidate khác.
- `trusted_repair`: ownership vẫn chấp nhận được, nhưng transcript cần repair.
- `untrusted_fail`: đã đi tới candidate cuối mà ownership vẫn không vượt qua được; pipeline chọn fail-safe.
- `trusted`: transcript đủ sạch và đủ đúng để publish.

### 11. Các cờ điều phối mà trust gate trả về

Trust gate không chỉ trả verdict. Nó còn trả cả các cờ điều phối runtime:

- `publication_blocked`: có chặn công bố artifact công khai hay không.
- `publish_ready`: transcript có sẵn sàng publish ngay hay không.
- `ownership_trusted`: transcript có được chấp nhận là “đúng ngữ hệ” hay không.
- `force_after_asr`: có buộc nhánh này chạy theo hướng `after_asr` hay không.
- `repair_window_indexes`: những window nào cần repair.

Trong config hiện tại:

- `AI_CHINESE_HOLD_UNVERIFIED_CHUNKS=true`.
- `AI_CHINESE_FORCE_AFTER_ASR_ON_RECOVERY=true`.
- `AI_CHINESE_FAIL_CLOSED=true`.

Hệ quả vận hành:

- Chỉ cần verdict khác `trusted`, pipeline sẽ chưa cho công bố public chunk/batch ngay.
- Khi trust-gated recovery active, pipeline mặc định cưỡng bức `after_asr`.
- Nếu recovery đi hết các candidate mà vẫn không có transcript đủ tin cậy, pipeline ném `ChineseTrustGateError` và đi vào failed path.

### 12. Candidate route loop của Chinese trust path chạy ra sao

Khi trust gate active, pipeline không còn đi theo producer-consumer công khai bình thường ngay từ đầu. Nó chuyển sang một vòng candidate kín.

Trình tự hiện tại:

- Bắt đầu với `selected_route` ban đầu.
- Nối thêm các recovery routes từ `settings.chinese_recovery_route_ids`.
- Chạy ASR cho từng candidate route theo thứ tự.
- Với mỗi candidate, chỉ thu transcript nội bộ, chưa phát chunk/batch công khai.
- Normalize transcript candidate.
- Profile transcript theo window.
- Chấm trust gate cho candidate đó.

Trong vòng candidate này, pipeline giữ lại hai loại candidate:

- Candidate đầu tiên đạt mức “đúng ngữ hệ chấp nhận được”.
- Candidate đầu tiên đạt mức “đủ tốt để publish”.

Điều này rất tinh tế:

- Một candidate có thể đủ để làm base ownership.
- Nhưng chưa chắc đủ sạch để publish final.

Nếu tìm thấy candidate `publish_ready`, pipeline dừng vòng recovery và dùng candidate đó.

Nếu chưa có `publish_ready` nhưng đã có candidate “đúng ngữ hệ”, pipeline vẫn có thể giữ nó lại làm base rồi repair bằng dữ liệu từ candidate khác.

### 13. Bước chuẩn hóa candidate đang làm những gì

Mỗi candidate transcript trước khi vào trust gate đều đi qua `normalize_chinese_candidate_sentences()`.

Bước chuẩn hóa này hiện làm các việc sau:

- Clone sentence để tránh sửa trực tiếp candidate gốc.
- Thử rebuild text từ `words`.
- So rebuilt text với fallback text ban đầu.
- Loại control characters như zero-width chars.
- Chuẩn hóa khoảng trắng.
- Canonicalize non-CJK text.
- Ưu tiên giữ lại fallback text nếu rebuilt text làm hỏng punctuation hoặc tạo ra chuỗi Latin bị tách vụn.

Ý nghĩa:

- Trust gate cần chấm trên transcript “đã được làm sạch hình thức”.
- Nếu chấm trực tiếp trên text còn control chars hoặc spacing méo, hệ thống dễ phạt oan transcript.

### 14. Window repair đang làm gì sau khi trust gate yêu cầu repair

Nếu base candidate có ownership chấp nhận được nhưng một số window bị đánh dấu xấu, pipeline sẽ gọi `repair_chinese_candidate_windows()`.

Cách nó hoạt động:

- Lấy transcript base làm nền.
- Với từng `repair_window_index`, profile lại các window hiện tại.
- Tìm một window thay thế tốt hơn từ các alternate candidates có chồng lấp thời gian.
- Chỉ chấp nhận cửa sổ thay thế nếu overlap thời gian đủ lớn và điểm nội dung tốt hơn rõ rệt.

Heuristic chấm cửa sổ thay thế hiện tại gồm:

- Độ dài nội dung sau khi bỏ noise.
- Bonus nếu window mixed-script hợp lý.
- Bonus nếu có các dấu hiệu lời chào/hỏi đáp như `你好`, `您好`, `幸会`, `请问`.
- Bonus theo `han_ratio`.

Điều kiện swap không phải “cứ candidate khác dài hơn là thay”. Hệ thống chỉ thay khi:

- Window mới tốt hơn base một khoảng đủ đáng kể.
- Hoặc có `han_ratio` cao hơn rõ.
- Hoặc mixed-script hợp lý hơn.
- Hoặc giữ được các lời chào/hỏi đáp tốt hơn.
- Hoặc dài nội dung hơn hẳn, nghĩa là ít bị mất chữ hơn.

Nói ngắn gọn:

- Repair không phải là splice ngẫu nhiên giữa các candidate.
- Nó là thay từng vùng thời gian khi có bằng chứng rằng candidate khác giữ nội dung đúng hơn.

### 15. Primary refine đang làm gì sau khi chọn được transcript base

Khi đã có transcript base đáng tin hơn, pipeline còn chạy `refine_chinese_primary_transcript()`.

Bước này không còn nhằm quyết định route nữa. Nó nhằm biến transcript “đúng hướng” thành transcript “đủ sạch để dịch và hiển thị”.

Các việc nó làm:

- Tách câu thành các clause theo dấu câu mạnh.
- Giữ cho mixed-script spacing tự nhiên hơn, tránh dính English vào Han text.
- Áp dụng các luật normalization cấu hình sẵn từ `AI_CHINESE_TEXT_NORMALIZATION_RULES`.
- Chỉ drop English-only clause nếu đó thực sự giống garbage span và cờ `AI_CHINESE_DROP_ENGLISH_GLOSS` bật.
- Bỏ adjacent duplicate clauses.
- Gom lại thành subtitle segments theo các ngưỡng:
`AI_CHINESE_MAX_SEGMENT_SECONDS=8.0`,
`AI_CHINESE_MAX_SEGMENT_HAN_CHARS=35`,
`AI_CHINESE_MAX_SEGMENT_SENTENCE_UNITS=3`.
- Dedupe các segment gần nhau nếu quá giống nhau, với các ngưỡng:
`AI_CHINESE_DUPLICATE_TIME_WINDOW_SECONDS=12.0`,
`AI_CHINESE_DUPLICATE_SIMILARITY=0.92`.
- Không dedupe các short phrases nằm trong whitelist như `你好`, `幸会`, `谢谢`, `哈哈`.
- Chạy một số repair dạng dialogue-specific punctuation recovery, ví dụ:
chèn dấu ngắt hợp lý cho “对，是我。”,
phục hồi dạng hỏi cho “你是…吧？”,
phục hồi dấu hỏi cho “等很久了吗？”,
và chuẩn hóa một số mẫu như “幸会，等很久了吗？”.

Ý nghĩa:

- Trust gate giải quyết “có tin transcript này hay không”.
- Primary refine giải quyết “đã tin rồi thì làm thế nào để transcript đủ đẹp và đủ ổn cho subtitle”.

### 16. Trust gate re-evaluate sau refine để làm gì

Sau khi repair và refine xong, pipeline không publish ngay. Nó còn gọi trust gate thêm một lần ở `post_refine`.

Mục đích:

- Kiểm tra xem transcript sau khi làm sạch có còn giữ được ownership đúng hay không.
- Tránh trường hợp repair hoặc normalization vô tình làm transcript nhìn sạch hơn nhưng mất dấu hiệu Chinese-family cốt lõi.

Nếu sau refine mà transcript mất ownership, pipeline vẫn fail-safe chứ không publish bừa.

### 17. Public artifact bị giữ lại ở bước nào

Đây là điểm rất quan trọng nếu bạn muốn giải thích vì sao Chinese path “không realtime như English”.

Khi trust gate active:

- Candidate ASR đầu tiên không gọi `_publish_chunk_side_effects`.
- Tức là `chunks/` công khai chưa được upload ngay.
- `chunk_ready` và `batch_ready` public events cũng chưa được phát ngay.

Thay vào đó:

- Candidate transcript chỉ được giữ nội bộ.
- Sau khi đã có trusted transcript và đã refine xong, pipeline mới gọi `_replay_chunk()` để upload lại các chunk trusted theo đúng contract bình thường.
- Sau đó consumer translation mới chạy để tạo `translated_batches`.

Nghĩa là:

- Chinese trust path hiện tại không chỉ “dịch chậm hơn”.
- Nó còn “cố tình giữ public artifact lại” cho đến khi transcript vượt qua trust boundary.

### 18. Trust gate ảnh hưởng thế nào tới `during_asr` và `after_asr`

Đây là chỗ rất nên nói rõ khi bảo vệ.

Có hai cơ chế khác nhau cùng có thể làm Chinese path không overlap:

- Cơ chế 1: route chưa được chứng nhận cho `during_asr`, router tự downgrade.
- Cơ chế 2: trust gate active và `AI_CHINESE_FORCE_AFTER_ASR_ON_RECOVERY=true`, pipeline cưỡng bức `after_asr` để giữ an toàn.

Điều đó có nghĩa là cùng một route, trong hai bối cảnh khác nhau có thể chạy hai policy khác nhau:

- Khi không cần trust-gated recovery, route có thể overlap.
- Khi trust gate active, pipeline vẫn có quyền chuyển sang nhánh bảo thủ hơn.

### 19. Những metric nào của trust gate được lưu để quan sát và đối chiếu

Ở cuối pipeline, `last_run_metrics` hiện ghi lại khá nhiều dữ liệu liên quan đến trust gate:

- `trust_gate_active`
- `trust_stage`
- `trust_attempts`
- `trust_decision`
- `chinese_normalize`
- `chinese_repair`
- `chinese_refine`

Ngoài ra trace nội bộ còn có các sự kiện như:

- `source_routing_decided`
- `trust_gate_evaluated`
- `asr_completed`

Nếu cần đối chiếu artifact/log khi làm benchmark hoặc khi bị hỏi phản biện, đây là những điểm rất hữu ích để chứng minh:

- pipeline đã chọn route nào,
- trust gate đã phán thế nào,
- candidate nào bị loại,
- và transcript cuối cùng đã đi qua repair/refine ra sao.

### 20. Cách nói gọn nhưng vẫn đúng về trust gate trước hội đồng

Nếu cần nói rất ngắn mà vẫn giữ được chất kỹ thuật, bạn có thể dùng form sau:

“Nhánh tiếng Trung của hệ thống có một trust boundary riêng cho transcript. Pipeline không công bố transcript ngay sau ASR, mà trước hết đánh giá xem transcript có đi đúng ngữ hệ và có đủ sạch hay chưa. Nếu chưa đạt, hệ thống thử nhánh phục hồi, sửa các vùng xấu theo cửa sổ thời gian, làm sạch transcript rồi mới cho đi tiếp. Nếu vẫn không đạt, hệ thống chấp nhận fail-safe thay vì xuất ra một transcript sai.”

Đây là câu trả lời ngắn nhưng rất sát với code hiện tại.

## Ghi chú trả lời nhanh nếu hội đồng hỏi chen vào

### Nếu bị hỏi: “Đây có phải realtime không?”

“Em sẽ trả lời là hệ thống có khả năng tạo kết quả tiến dần và hiển thị sớm hơn trong quá trình xử lý, nhưng em không gọi nó là live simultaneous interpreting theo nghĩa thời gian thực tuyệt đối.”

### Nếu bị hỏi: “Vì sao tiếng Trung bị `after_asr`?”

“Trong benchmark hiện tại, nhánh tiếng Trung bị kéo về `after_asr` vì hệ thống đánh giá đây là nhánh cần xử lý thận trọng hơn. Nói cách khác, pipeline ưu tiên độ tin cậy của transcript trước, rồi mới tối ưu chuyện công bố bản dịch sớm.”

### Nếu bị hỏi: “Trust gate là gì?”

“Trust gate là lớp kiểm định độ tin cậy transcript tiếng Trung ngay trong runtime. Nó kiểm tra xem transcript có đúng hướng ngôn ngữ và có đủ sạch để công bố hay chưa. Nếu chưa đạt, hệ thống có thể chưa công bố ngay, thử nhánh phục hồi hoặc dừng theo hướng an toàn.”

### Nếu bị hỏi: “Vì sao WER tiếng Trung cao hơn tiếng Anh?”

“Vì Chinese path hiện khó hơn cả ở route lẫn policy runtime. Benchmark cho thấy tiếng Trung đang đi qua nhánh thận trọng hơn, lớp kiểm định transcript đang bật, cách chạy bảo thủ hơn và chất lượng transcript dao động mạnh hơn giữa các case. Em xem đây là vấn đề của cả pipeline hiện tại, không quy về một nguyên nhân đơn lẻ.”
