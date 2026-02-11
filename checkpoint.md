# 📂 PROJECT CONTEXT: BILINGUAL SUBTITLE SYSTEM (CHECKPOINT)

## 1. Project Overview
**Goal:** Build a system that generates bilingual subtitles (Source + Target + Phonetic/Pinyin) for videos/audio to support language learning, but not a educational platform, we're building a saas platform for improving language learning experience.
**Core Philosophy:** "Client-side Optimization & Async Processing".
-   Mobile App handles audio extraction to save bandwidth.
-   Backend acts as a lightweight dispatcher.
-   AI Engine runs independently to process heavy tasks.

## 2. Technical Architecture (Monorepo)

### Directory Structure
```text
bilingual-subtitle-system/   <-- ROOT PROJECT
├── apps/
│   ├── mobile-app/          <-- Frontend: React Native (Expo)
│   ├── backend-api/         <-- Backend: NestJS (API Gateway, Job Producer)
│   │   ├── src/             <-- Auth, Media Logic, Subscription, Queue Producer
│   └── ai-engine/           <-- Worker: Python (Core Processing, Job Consumer)
│       ├── src/
│       │   ├── main.py      <-- Entry point listening to Redis (BullMQ)
│       │   └── core/        <-- AudioInspector, SmartAligner, TranslatorEngine
├── infra/                   <-- Infrastructure
│   ├── postgres/            <-- Database
│   ├── redis/               <-- Message Queue Broker
│   └── minio/               <-- Object Storage (S3 Compatible)
├── docker-compose.yml

```

### Infrastructure

* **Storage:** MinIO (Local) mapped via Cloudflare Tunnel (`https://bilingual-minio.sondndev.id.vn`).
    * *Strategy:* Presigned URLs. Backend replaces internal Docker URL with public domain before returning to client.
* **Queue:** Redis + BullMQ.
* **Database:** PostgreSQL + Prisma ORM.

## 3. Key Features & Business Logic (Based on Use Cases)

### A. Authentication & User (Done)

* **Strategy:** "Verify-First" (Cache registration data in Redis, only create User in Postgres after OTP verify).
* **Post-Action:** Auto-assign "FREE_TIER" subscription upon verification.

### B. Subscription (Done Schema & Admin)

* **Model:** Separation of **Product** (`SubscriptionPlan`) and **Price/Limit** (`PlanVariant`).
* **Stability:** Subscription records store a **SNAPSHOT** of price/quota at purchase time (Immutable).
* **Admin:** Dynamic management of plans/variants.

### C. Media Library Management

* **Inputs:**
1. **Local File:** Mobile extracts audio -> Uploads audio to MinIO -> Backend queues job.
2. **Link:** User sends Link -> Backend queues job (Async validation & download).


* **Functions:** Upload, Import from Link, Track Status (Queued/Processing/Done), Delete.

### D. Media Player (Client-Side Features)

* **Playback Control:** Speed (0.5x - 2.0x), Seek.
* **3-Layer Display:** Original Sub, Translated Sub, Phonetic (Pinyin/IPA).
* **Interactive Learning:**
* **Seek by Caption:** Click subtitle line to jump video time.
* **Quick Lookup:** Tap word to see dictionary meaning & pronunciation.



## 4. System Flow: The Upload & Processing Pipeline

*(Based on Activity Diagram & Previous Discussions)*

1. **Mobile App:**
* User selects Video/Audio.
* **Check:** If Video -> Extract Audio (Client-side).
* **Upload:** Request Presigned URL -> Upload Audio to MinIO.
* **Confirm:** Notify Backend (`POST /media/confirm-upload`).


2. **Backend System:**
* Verify file in MinIO.
* Create `MediaItem` (Status: `QUEUED`).
* Dispatch Job to Redis (BullMQ).
* Return `media_id` to Client immediately.


3. **AI Engine (Worker):**
* Consume Job from Redis.
* Process AI (ASR -> Align -> Translate -> G2P).
* Generate Output JSON.
* Update Database (Status: `COMPLETED`) & Save JSON path.


4. **Client Update:** Polling/Socket to receive status change.

## 5. Data Models & Payloads

### A. Database Schema (Prisma)

*(Current Snapshot)*

```prisma
// User, Subscription, Plan, Variant, MediaItem, Vocabulary, OTP
// Key Enums: MediaOriginType (LOCAL, YOUTUBE), MediaStatus (QUEUED, PROCESSING, COMPLETED, FAILED)
// (Full schema code is known and ready to be used)

```

### B. Job Payload (Redis Message)

```json
{
  "job_id": "uuid",
  "media_id": "uuid-from-db",
  "user_id": "uuid-user",
  "plan_type": "PRO",
  "input": {
    "origin_type": "LOCAL",
    "storage_path": "uploads/audio/.../file.mp3",
    "source_lang": "en",
    "target_lang": "vi"
  },
  "config": {
    "generate_phonetic": true,
    "model_size": "base"
  }
}

```

### C. Current AI Output Format (Raw)

```json
[
  {
    "text": "Sentences in source lang",
    "start": 33.9,
    "end": 38.24,
    "words": [
      { "word": "Word", "start": 33.9, "end": 34.2, "confidence": 0.9, "phoneme": "wǒ" }
    ]
  }
]

```

## 6. Current Implementation Status & Next Steps

### Completed

* [x] Backend Auth & Subscription Logic.
* [x] Infrastructure (MinIO, Tunnel, Redis).
* [x] AI Core Logic (Python standalone).
* [x] Backend Producer (Pushing jobs to Redis).

### The Missing Link (Focus of Next Session)

* **Objective:** Connect the **AI Engine (Python)** to the **Redis Queue** to consume the jobs sent by the Backend.
* **Discussion Point:** Finalize the storage format for Subtitles (JSON) to support the "3-Layer Display" and "Quick Lookup" features effectively.
* **Action:** Implement the Consumer logic in `apps/ai-engine/src/main.py`.
