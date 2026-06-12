# Tóm tắt kết quả thực nghiệm Chương 3

## 1. Phạm vi và nguồn dữ liệu

Phần này tổng hợp từ package benchmark mới nhất:

- Package export: `docs/experiments/chapter3-final-20260611/`
- Run benchmark gốc: `outputs/e2e-benchmarks/runs/chapter3-full-20260611-rerunmerge-FqqK8hQzPgM`

Các file nguồn quan trọng:

- `docs/experiments/chapter3-final-20260611/chapter3_benchmark_report.md`
- `docs/experiments/chapter3-final-20260611/chapter3_results.json`
- `docs/experiments/chapter3-final-20260611/chapter3_quality_metrics.csv`
- `docs/experiments/chapter3-final-20260611/chapter3_artifact_metrics.csv`
- `docs/experiments/chapter3-final-20260611/chapter3_policy_metrics.csv`
- `docs/experiments/chapter3-final-20260611/chapter3_manual_translation_review.csv`

Lưu ý rất quan trọng:

- Exporter đọc lại một run đã lưu, **không** rerun benchmark và **không** thay đổi hành vi model.
- Các mốc thời gian là **polling-observed timings** từ backend status polling, không phải timestamp tuyệt đối của socket hoặc client.
- Package này tự mô tả hệ thống là **progressive asynchronous subtitle generation**, không phải live simultaneous interpretation.

Nguồn đối chiếu:

- `docs/experiments/README.md`
- `apps/backend-api/scripts/export-chapter3-benchmark.ts`
- `apps/backend-api/scripts/e2e-youtube-benchmark/chapter3-export.ts`

## 2. Dataset benchmark

## 2.1. Thành phần dataset

Theo `chapter3_results.json` và `chapter3_benchmark_report.md`, bộ benchmark hiện tại gồm:

- Tổng số case: `20`
- English: `10`
- Chinese: `10`
- Case có manual subtitle để tính WER/CER: `18`
- Case không có manual subtitle: `2`
- Target language của cả run: `vi`

## 2.2. Điều kiện chạy

- Base URL benchmark: `http://localhost:3000/api`
- Polling interval: `1000 ms`
- Command được suy ra từ manifest:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-e2e-youtube-pipeline.ps1 -TargetLanguage vi -PollMs 1000 -OutputDir C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-full-20260611-rerunmerge-FqqK8hQzPgM
```

## 2.3. Ý nghĩa của dataset

Dataset này phù hợp để đánh giá:

- Độ hoàn chỉnh end-to-end của pipeline
- Độ trễ xử lý theo case
- Khả năng tạo artifact tiến dần
- Chất lượng transcript nguồn qua WER/CER

Dataset này **chưa đủ** để kết luận mạnh về:

- Chất lượng bản dịch đích nếu chưa có manual review hoàn chỉnh
- Live interpreting
- Generalization production-scale

## 3. Metrics chính đang có trong package

## 3.1. Nhóm metric hiệu năng

- `wall_clock_latency_seconds`
- `processing_to_duration_ratio`
- `throughput_multiplier`
- `time_to_first_chunk_seconds`
- `time_to_first_translated_batch_seconds`
- `time_to_has_final_seconds`
- `time_to_completed_seconds`

## 3.2. Nhóm metric policy / routing

- `requested_translation_start_policy`
- `effective_translation_start_policy`
- `auto_policy_downgraded`
- `route`
- `asr_provider`
- `trust_gate_active`

## 3.3. Nhóm metric artifact completeness

- `chunk_count`
- `translated_batch_count`
- `has_final`
- `progressive_artifacts_before_final`
- `segments_with_translation`
- `missing_phonetic_count`
- `invalid_timestamp_count`
- `overlapping_segment_count`
- `schema_validation_status`

## 3.4. Nhóm metric chất lượng transcript

- `WER`
- `CER`
- số token tham chiếu
- số ký tự tham chiếu

Quan trọng:

- WER/CER ở đây là cho **transcript nguồn**, không phải thước đo trực tiếp cho chất lượng bản dịch tiếng Việt.

## 4. Kết quả hiệu năng tổng hợp

## 4.1. Kết quả toàn bộ 20 case

Theo `chapter3_results.json`:

- Average WER: `0.13`
- Average latency: `143.27 giây`
- Average processing/duration ratio: `0.223`
- Average time to first chunk: `69.024 giây`
- Average time to first translated batch: `76.132 giây`

Diễn giải:

- Trung bình toàn run, pipeline hoàn tất trong khoảng 143 giây mỗi case.
- Với ratio `0.223`, thời gian xử lý trung bình nhỏ hơn thời lượng media, nhưng đây vẫn là xử lý bất đồng bộ có độ trễ tích lũy đáng kể.
- `first chunk` và `first translated batch` cho thấy hệ thống có thể tạo output trung gian trước khi final hoàn tất.

## 4.2. So sánh English và Chinese

| Nhóm | Số case | Avg latency (s) | Avg ratio | Avg first chunk (s) | Avg first batch (s) | Avg WER | Avg CER |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| English | 10 | 125.288 | 0.193 | 67.714 | 67.714 | 0.036 | 0.021 |
| Chinese | 10 | 161.251 | 0.253 | 70.333 | 84.55 | 0.247 | 0.181 |

Ý nghĩa:

- English hiện cho kết quả ổn định hơn cả về latency lẫn transcript quality.
- Chinese chậm hơn và sai số transcript cao hơn đáng kể.
- `first translated batch` của Chinese đến muộn hơn English, phù hợp với thực tế policy tiếng Trung đang bị kéo về `after_asr`.

## 4.3. Kết luận hiệu năng nên nói trên slide

Có thể nói ngắn:

> Hệ thống hiện đã chạy end-to-end ổn định trên 20/20 case benchmark, có khả năng tạo artifact trung gian trước khi hoàn tất, nhưng độ trễ và độ ổn định giữa tiếng Anh và tiếng Trung còn chênh lệch rõ.

## 5. Kết quả WER/CER

## 5.1. Mức trung bình

- Toàn bộ run: `Avg WER = 0.13`
- English: `Avg WER = 0.036`, `Avg CER = 0.021`
- Chinese: `Avg WER = 0.247`, `Avg CER = 0.181`

## 5.2. Một số case Chinese tốt

Các case transcript Chinese có kết quả tương đối tốt:

- `chinese_WA18WJmXZZE`: `WER 0.065`, `CER 0.044`
- `chinese_GOjlcDYurP0`: `WER 0.089`, `CER 0.095`
- `chinese__4GSI4J-GuA`: `WER 0.086`, `CER 0.042`
- `chinese_FqqK8hQzPgM`: `WER 0.124`, `CER 0.083`

Điều này cho thấy pipeline tiếng Trung **không phải lúc nào cũng tệ**, nhưng độ ổn định chưa đều.

## 5.3. Một số case Chinese xấu

Các case Chinese có sai số cao:

- `chinese_-MTOd9V0VPU`: `WER 0.626`, `CER 0.433`
- `chinese_8sn3YzhnprM`: `WER 0.617`, `CER 0.459`
- `chinese_Y9_-pAk3Iag`: `WER 0.247`, `CER 0.213`

Điểm nên nói thẳng:

- WER/CER tiếng Trung phân tán mạnh
- Vấn đề nằm ở độ ổn định transcript nguồn, route/policy và trust-gate path

## 5.4. English ổn định hơn

Các case English chủ yếu nằm trong vùng WER thấp:

- thấp nhất: `0.01`
- cao hơn nhưng vẫn chấp nhận được trong run này: `0.076`

Điều đó phù hợp với:

- route tiếng Anh ổn định hơn
- không bật trust gate
- policy benchmark vẫn giữ `during_asr`

## 5.5. Cần diễn giải WER/CER cẩn thận

Khi bảo vệ, nên nói rõ:

1. WER/CER ở đây đo transcript nguồn so với manual subtitle.
2. Nó phản ánh chất lượng ASR và một phần segmentation.
3. Nó **không tự động chứng minh** bản dịch tiếng Việt tốt hay xấu.

## 6. Tóm tắt translation policy và trust gate

## 6.1. English

Theo `chapter3_benchmark_report.md`, toàn bộ 10 case English có:

- requested policy: `during_asr`
- effective policy: `during_asr`
- auto downgraded: `false`
- route: `distil_whisper_en`
- provider: `whisper`
- trust gate active: `false`

## 6.2. Chinese

Toàn bộ 10 case Chinese có:

- requested policy: `during_asr`
- effective policy: `after_asr`
- auto downgraded: `true`
- route: `sensevoice_small`
- provider: `sensevoice`
- trust gate active: `true`

## 6.3. Ý nghĩa kỹ thuật

Đây là một phát hiện quan trọng để giải thích toàn bộ benchmark:

- English đang dùng route/policy thuận lợi hơn cho output sớm.
- Chinese đang đi qua nhánh thận trọng hơn, ưu tiên tin cậy transcript hơn là dịch chồng sớm.
- Vì vậy nếu hội đồng hỏi “vì sao gọi là thời gian thực mà tiếng Trung batch đến muộn”, câu trả lời đúng là:

> Hệ thống có khả năng xử lý tiến dần, nhưng trong benchmark hiện tại tiếng Trung bị auto-downgrade sang `after_asr` do route/policy chưa được chứng nhận an toàn cho `during_asr`, cộng thêm trust gate đang bật.

## 7. Minh chứng artifact và final output

## 7.1. Artifact completeness

Theo bảng artifact summary:

- `20/20` case có `final.json`
- `20/20` case có schema `valid`
- `0` empty translation
- `0` invalid timestamp
- `0` overlap

Đây là điểm kỹ thuật rất đáng nói:

- Dù chất lượng transcript không đồng đều, contract output cuối vẫn khá sạch ở mức cấu trúc.

## 7.2. Progressive artifact evidence

Theo package export:

- `18/20` case có thể suy ra đã tạo artifact tiến dần trước khi final hoàn tất

Nhưng phải nói đúng:

- Đây là suy ra từ timeline polling và artifact visibility
- Không phải timestamp socket trực tiếp

## 7.3. Minh chứng file cụ thể

Một case English có thể dùng để trình bày artifact:

- `outputs/e2e-benchmarks/runs/chapter3-full-20260611-rerunmerge-FqqK8hQzPgM/results/english_-moW9jvvMr4/chunk.first.json`
- `outputs/e2e-benchmarks/runs/chapter3-full-20260611-rerunmerge-FqqK8hQzPgM/results/english_-moW9jvvMr4/translated_batch.first.json`
- `outputs/e2e-benchmarks/runs/chapter3-full-20260611-rerunmerge-FqqK8hQzPgM/results/english_-moW9jvvMr4/final.json`
- `outputs/e2e-benchmarks/runs/chapter3-full-20260611-rerunmerge-FqqK8hQzPgM/results/english_-moW9jvvMr4/artifacts.inventory.json`

Một case Chinese có thể dùng để trình bày:

- `outputs/e2e-benchmarks/runs/chapter3-full-20260611-rerunmerge-FqqK8hQzPgM/results/chinese_FqqK8hQzPgM/final.json`
- `docs/experiments/chapter3-rerun-chinese_FqqK8hQzPgM-20260611/chapter3_benchmark_report.md`

## 7.4. Minh chứng “player”

Hiện run bundle và package export **không lưu sẵn screenshot/video player**.

Những gì đang có:

- Code player hiện tại: `apps/mobile-app/src/app/(app)/player.tsx`
- Logic hydrate subtitle: `apps/mobile-app/src/hooks/usePlayerSubtitles.ts`
- Exporter gợi ý nên chụp screenshot player trong `chapter3_benchmark_report.md`

Vì vậy khi làm slide:

- nên tự chụp màn hình player từ app đang chạy
- và nói rõ đó là minh chứng giao diện của output `final.json`/`translated_batches`, không phải artifact benchmark tự động lưu

## 8. Đánh giá bản dịch thủ công

Package hiện có file:

- `docs/experiments/chapter3-final-20260611/chapter3_manual_translation_review.csv`

Nhưng trạng thái thực tế:

- CSV đã có sample segment, source text, system translation, phonetic
- Các cột điểm như `meaning_preservation_score`, `fluency_score`, `subtitle_readability_score` hiện đang để trống

Kết luận đúng:

- Hệ thống đã chuẩn bị được **khung** để review bản dịch thủ công
- Nhưng ở snapshot hiện tại chưa có bộ điểm manual review hoàn chỉnh để rút ra kết luận mạnh về translation quality

Đây là một hạn chế nên nói thẳng khi bảo vệ.

## 9. Các hạn chế cần nói thẳng

## 9.1. Không phải live simultaneous interpreting

Benchmark package ghi rõ:

> progressive asynchronous subtitle generation

Do đó không nên mô tả hệ thống như dịch nói đồng thời real-time tuyệt đối.

## 9.2. WER/CER tiếng Trung cao hơn tiếng Anh

Nguyên nhân hợp lý khi giải thích:

- route tiếng Trung khó hơn
- trust gate đang bật
- policy benchmark thực tế bị downgrade sang `after_asr`
- transcript Chinese biến động mạnh giữa các case

## 9.3. Translation quality chưa có thước đo hoàn chỉnh

Hiện có:

- WER/CER cho transcript nguồn
- mẫu manual review

Chưa có:

- manual review đã chấm xong
- metric tự động mạnh cho chất lượng bản dịch đích

## 9.4. Timing có tính xấp xỉ

Các mốc thời gian chịu ảnh hưởng bởi:

- polling interval `1000 ms`
- thời điểm status được backend cập nhật

Nên số liệu rất hữu ích để so sánh case, nhưng không phải đo đạc chính xác tuyệt đối ở mức frame hay event delivery.

## 9.5. Một số bằng chứng player cần tự bổ sung cho slide

Benchmark bundle hiện không kèm:

- screenshot player
- video demo player

Phần này nên được chuẩn bị thủ công khi dựng slide/demo.

## 10. Cách rút gọn cho 1 slide kết quả Chương 3

Nếu chỉ có 1 slide để nói kết quả, có thể tóm tắt:

1. Chạy thành công `20/20` case benchmark YouTube, gồm `10 English` và `10 Chinese`.
2. Toàn bộ `20/20` case sinh được `final.json` hợp lệ; `18/20` case có dấu hiệu artifact tiến dần trước final.
3. English hiện ổn định hơn Chinese: `WER 0.036` so với `0.247`, latency `125.288s` so với `161.251s`.
4. Hạn chế hiện tại là tiếng Trung còn bị trust gate và auto-downgrade sang `after_asr`, nên chưa thể overclaim khả năng dịch thời gian thực theo nghĩa live.
