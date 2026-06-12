# Câu hỏi phản biện dự kiến và câu trả lời gợi ý

## 1. Đề tài này là nghiên cứu mô hình mới hay phát triển ứng dụng?

**Trả lời gợi ý:** Đây là đồ án phát triển ứng dụng phần mềm có tích hợp Machine Learning. Em tập trung vào xây dựng hệ thống end-to-end, tích hợp các thành phần ASR, dịch, storage, queue và player; em không huấn luyện hay fine-tune mô hình mới.

## 2. Vì sao trong tên đề tài có “thời gian thực” nhưng em lại nói không phải live interpreting?

**Trả lời gợi ý:** Em dùng “thời gian thực” theo hướng tạo kết quả tiến dần và cập nhật trong quá trình xử lý, chứ không claim live simultaneous interpreting tuyệt đối. Benchmark hiện tại cũng mô tả hệ thống là progressive asynchronous subtitle generation.

## 3. Hệ thống hiện nhận những loại đầu vào nào?

**Trả lời gợi ý:** Hiện tại có hai đường vào chính trong code: upload media cục bộ qua presigned URL và submit YouTube URL để backend worker tải audio về rồi xử lý tiếp.

## 4. Tại sao em phải tách Backend API, Backend Worker và AI Engine?

**Trả lời gợi ý:** Vì xử lý media là tác vụ nặng và kéo dài. Tách API khỏi worker và AI Engine giúp request người dùng không bị block, hệ thống dễ retry hơn, và có thể mở rộng từng lớp độc lập.

## 5. Vì sao dùng BullMQ và Redis?

**Trả lời gợi ý:** BullMQ dùng để điều phối job bất đồng bộ giữa API worker và AI Engine. Redis vừa là backend cho BullMQ, vừa làm Pub/Sub để phát tiến độ sang Socket gateway.

## 6. Vai trò của MinIO trong hệ thống là gì?

**Trả lời gợi ý:** MinIO lưu raw upload, audio trích từ YouTube và toàn bộ artifact xử lý như `chunks/`, `translated_batches/`, `final.json`. Nhờ lưu bền trên object storage, client có thể phục hồi trạng thái dù mất kết nối socket.

## 7. Vì sao cần cả socket lẫn artifact trên MinIO?

**Trả lời gợi ý:** Socket giúp cập nhật nhanh progress và sự kiện mới. Artifact trên MinIO là nguồn dữ liệu bền, giúp client đọc lại được trạng thái và subtitle ngay cả khi event socket không còn.

## 8. `chunks/`, `translated_batches/`, `final.json` khác nhau thế nào?

**Trả lời gợi ý:** `chunks/` là transcript từng phần xuất hiện sớm sau ASR. `translated_batches/` là các cụm subtitle đã dịch xong. `final.json` là output chuẩn cuối cùng để player dùng làm nguồn chính.

## 9. Tại sao không chỉ xuất đúng một file final ở cuối?

**Trả lời gợi ý:** Nếu chỉ chờ final thì trải nghiệm chờ rất lâu và khó chứng minh tính tiến dần của hệ thống. Tách artifact trung gian cho phép người dùng thấy kết quả sớm hơn và giúp benchmark được first chunk, first batch.

## 10. Trong hệ thống này, bản dịch được tạo bởi mô hình nào?

**Trả lời gợi ý:** Base translation hiện tại là NMT dùng NLLB-200-3.3B qua CTranslate2. Một số nhánh có lớp hậu xử lý bản dịch bằng LLM nếu được bật, nhưng đó không phải đường dịch nền mặc định cho mọi case.

## 11. `during_asr` và `after_asr` là gì?

**Trả lời gợi ý:** `during_asr` là định hướng bắt đầu dịch sớm hơn trong khi ASR đang tiến hành. `after_asr` là đợi transcript ổn hơn rồi mới dịch. Đây là policy ở mức pipeline, không phải hai sản phẩm khác nhau.

## 12. Vì sao benchmark tiếng Trung hiện đều bị chuyển sang `after_asr`?

**Trả lời gợi ý:** Theo policy metadata trong benchmark hiện tại, route tiếng Trung đang dùng chưa được chứng nhận an toàn cho `during_asr`, đồng thời trust gate bật để bảo vệ chất lượng transcript. Vì vậy hệ thống auto-downgrade sang `after_asr`.

## 13. Trust gate tiếng Trung là gì?

**Trả lời gợi ý:** Trust gate là lớp kiểm tra độ tin cậy transcript tiếng Trung dựa trên các tín hiệu như tỷ lệ ký tự Hán, pinyin-like ratio, confidence, lexical diversity, repetition và dấu hiệu lệch route. Nếu transcript đáng ngờ, hệ thống có thể chặn publish sớm hoặc đi sang nhánh recovery.

## 14. Vì sao WER tiếng Trung cao hơn tiếng Anh?

**Trả lời gợi ý:** Vì route tiếng Trung hiện khó hơn và kém ổn định hơn trong benchmark, đồng thời policy đang thiên về `after_asr` và trust gate active. Benchmark cũng cho thấy transcript Chinese dao động mạnh giữa các case hơn English.

## 15. WER/CER trong đồ án này có đo chất lượng bản dịch tiếng Việt không?

**Trả lời gợi ý:** Không trực tiếp. WER/CER hiện dùng để so transcript nguồn với manual subtitle nguồn, nên nó phản ánh chủ yếu chất lượng ASR và segmentation. Chất lượng bản dịch đích cần manual review hoặc metric riêng.

## 16. Vậy hiện tại em đánh giá translation quality thế nào?

**Trả lời gợi ý:** Trong package benchmark hiện có CSV mẫu để review thủ công theo các tiêu chí như giữ nghĩa, độ trôi chảy, giữ thuật ngữ và khả năng đọc subtitle. Tuy nhiên snapshot hiện tại chưa có bộ điểm manual review hoàn chỉnh, nên em không overclaim phần này.

## 17. Số liệu thời gian trong benchmark có chính xác tuyệt đối không?

**Trả lời gợi ý:** Không tuyệt đối. Các mốc như first chunk hay first batch được suy ra từ timeline polling backend status với chu kỳ 1000 ms. Vì vậy chúng phù hợp để so sánh tương đối giữa các case, nhưng không phải event timestamp tuyệt đối.

## 18. Hệ thống có những điểm nào em xem là đóng góp kỹ thuật chính?

**Trả lời gợi ý:** Em xem ba điểm lớn là: kiến trúc end-to-end tách lớp rõ ràng; cơ chế artifact tiến dần bền trên MinIO kết hợp socket; và pipeline routing cùng trust gate cho tiếng Trung để cân bằng giữa tốc độ và độ tin cậy.

## 19. Dashboard trong hệ thống dùng để làm gì?

**Trả lời gợi ý:** Dashboard hiện là bề mặt admin/monitoring nội bộ để xem queue, failure và translation finalization. Nó hỗ trợ vận hành hệ thống, không phải thành phần UX chính cho người dùng cuối.

## 20. Nếu có thời gian phát triển tiếp, em sẽ ưu tiên gì?

**Trả lời gợi ý:** Em sẽ ưu tiên ba hướng: cải thiện route tiếng Trung và chính sách `during_asr`, hoàn thiện đánh giá chất lượng bản dịch đích bằng manual review hoặc metric phù hợp, và tối ưu thêm latency để rút ngắn thời gian xuất hiện first translated batch.
