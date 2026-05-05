# Bilingual Subtitle System - Project Instruction

## 1. Project Vision

This repository builds a SaaS platform for high-accuracy bilingual subtitles with word-level karaoke timing. The product is meant first as a productivity tool for media consumption and content creation, not as a generic EdTech app, and it is designed around bilingual output, precise timing, durable streaming artifacts, and strict quota-aware operations.

## 2. System Architecture

```text
Mobile App
  |
  | authenticated API calls + socket updates
  v
Backend API (NestJS)
  |\
  | \-- PostgreSQL (users, subscriptions, media, usage, refresh tokens)
  | \-- MinIO presigned upload flow -> raw bucket
  |
  +-> Redis / BullMQ: transcription queue
          |
          v
     Backend Worker (validation, YouTube ingestion, quota re-check)
          |
          +-> Redis / BullMQ: ai-processing queue
                    |
                    v
               AI Engine (Python GPU worker)
                    |
                    +-> MinIO processed artifacts: chunks/, translated_batches/, final.json
                    +-> PostgreSQL progress + status updates
                    +-> Redis Pub/Sub events mirrored by backend sockets to mobile
```

## 3. Module Roles

### Backend API

`apps/backend-api` owns authentication, subscriptions, media APIs, presigned upload negotiation, BullMQ job production, and the validation worker that prepares audio before GPU processing. Read [apps/backend-api/INSTRUCTION.md](apps/backend-api/INSTRUCTION.md) for working rules and [apps/backend-api/CHECKPOINT.md](apps/backend-api/CHECKPOINT.md) for current feature status.

### AI Engine

`apps/ai-engine` owns the live subtitle pipeline from normalized audio through VAD, alignment, translation, streaming artifacts, and final JSON export. Read [apps/ai-engine/INSTRUCTION.md](apps/ai-engine/INSTRUCTION.md) for pipeline and contract rules and [apps/ai-engine/CHECKPOINT.md](apps/ai-engine/CHECKPOINT.md) for the current V2 state.

### Mobile App

`apps/mobile-app` owns upload UX, authenticated session handling, socket-first processing feedback, and the incremental subtitle player that starts from translated batches before the final artifact exists. Read [apps/mobile-app/INSTRUCTION.md](apps/mobile-app/INSTRUCTION.md) for UI and workflow rules and [apps/mobile-app/CHECKPOINT.md](apps/mobile-app/CHECKPOINT.md) for shipped phases and known constraints.

## 4. Key Use Cases

### UC_LIBRARY - Upload Flow

1. The user selects a local audio or video file, or submits a YouTube link.
2. If the source is a video, the mobile app extracts audio locally before upload.
3. The backend issues a presigned MinIO upload URL for direct client upload.
4. The client confirms the upload or submits the YouTube job, and the backend creates a `MediaItem`.
5. The backend worker validates the media, then dispatches the GPU job to the AI engine.
6. The AI engine produces `chunks/`, `translated_batches/`, and `final.json`, updates status in PostgreSQL, and emits progress events.

### UC_PLAYER - Playback Flow

1. The mobile app fetches media status and artifact inventory for a completed or in-progress item.
2. Playback can begin from incremental `translated_batches` before `final.json` exists.
3. The player renders source and translated subtitles with karaoke timing from word timestamps.
4. Incoming translated batches extend the session without forcing a full reload.
5. Word taps are used to drive dictionary and vocabulary interactions.

## 5. SaaS Constraints

- Quota and tier enforcement are first-class requirements; backend logic must check subscription snapshots and usage history before allowing processing.
- Media and users use soft deletes rather than hard deletion, and usage data must remain audit-ready.
- Monthly usage is tracked for auditability, and the project guidance prefers snapshot-style reporting instead of recomputing raw history on every read.
- The active product contract is bilingual-by-default and uses `targetLanguage`; `processingMode` is removed.

## 6. For Agents

Read `AGENTS.md` at the repository root first. Then read the active module's `INSTRUCTION.md` and `CHECKPOINT.md` before making changes so your work reflects the live contracts and current feature state.
