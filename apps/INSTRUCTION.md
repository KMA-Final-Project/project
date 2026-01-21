# BILINGUAL SUBTITLE SYSTEM - PROJECT INSTRUCTIONS

## 1. Project Philosophy & Vision

-   **Type:** SaaS Application (Software as a Service).
-   **Core Value:** Provide high-accuracy bilingual subtitles (Source + Target Language) with "Karaoke" timing (Word-level timestamps).
-   **Not an EdTech App:** While useful for learning, the primary function is a **Productivity Tool** for media consumption and content creation.
-   **Architecture:** Microservices/Worker-based architecture within a Monorepo.
-   **Key Constraints:**
    -   **Efficiency:** Optimize for hardware (RTX 5060 Ti) and cost.
    -   **SaaS Logic:** Strict enforcement of Quotas, Tiers (Free/Pro), and Usage Auditing.

## 2. Functional Requirements (Use Cases)

### UC_LIBRARY: Media Management

-   **Inputs:**
    -   **Local File:** User uploads video/audio. **CRITICAL:** if video, extract audio first on client side (mobile).
    -   **YouTube Link:** System downloads audio stream directly.
-   **Storage:**
    -   Media metadata in Relational DB (Postgres).
    -   Audio files & JSON Results in Object Storage (MinIO/S3).
    -   Strict separation of "Hot Data" vs "Cold Data".

### UC_PLAYER: Smart Playback

-   **Dual Subtitles:** Display Source and Target languages simultaneously.
-   **Interactive:** Click on a word to view dictionary definition (Context-aware).
-   **Karaoke Effect:** Highlight current word based on precise timestamps.

## 3. System Workflows (Activity Flows)

### 3.1. Upload & Processing Pipeline

1.  **Client:** Select Media -> (If Video: Extract Audio) -> Upload Audio/Link.
2.  **API Gateway:** Receive Request -> Check Quota/Plan -> Upload to S3 -> Push Job to Redis Queue.
3.  **AI Engine (Worker):**
    -   Pull Job.
    -   **Preprocessing:** Normalize Audio -> **VAD (Silence Detection)**.
    -   **Strategy:**
        -   **Happy Case (< 15s):** Fast Transcribe.
        -   **Special Case (> 15s):** Recursive Alignment (Word-level refinement) to split long segments and prevent hallucinations.
    -   **Post-processing:** Merge Sentences -> Translate -> Generate JSON.
4.  **Completion:** Update DB -> Notify Client via Socket/Polling.

## 4. Database Design Principles (SaaS Oriented)

-   **Subscription Based:** Logic must check `subscription_plans` and `usage_histories`.
-   **Audit Ready:** Never strictly delete usage data. Use "Soft Delete" (`deleted_at`) for Media/Users.
-   **Performance:** Use "Snapshot" tables for monthly usage reports instead of recalculating from raw logs.

## 5. Coding Standards for AI & Backend

-   **Language:** Python 3.12 (AI), Node.js/TypeScript (API).
-   **AI Configuration:** NEVER hardcode parameters. Use `AI_PERF_MODE` (Low/Medium/High) to adjust Batch Size/Beam Size dynamically.
-   **Error Handling:** Graceful failure. If GPU OOM, log error and retry or fallback (do not crash the worker).
