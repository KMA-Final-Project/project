# Mobile App (Kapter) - Development Rules & Guidelines

## 1. Architecture Overview

-   **Framework:** React Native / Expo (v54+)
-   **Routing:** Expo Router (File-based routing)
-   **Language:** TypeScript
-   **Structure:**
    ```text
    src/
    ├── app/             # Expo Router pages (/(auth), /(app), _layout.tsx)
    ├── components/      # Reusable UI components (grouped by domain e.g., auth, media, player)
    ├── services/        # API integration (Axios clients, token storage wrappers)
    ├── stores/          # Global state management (Zustand)
    ├── theme/           # Design tokens, layout configurations (react-native-unistyles)
    ├── i18n/            # Localization setup and translation JSON files
    ├── constants/       # App-wide constants (routes, API endpoints)
    ├── validations/     # Zod schemas for input validation
    ├── types/           # Shared TypeScript interfaces & DTOs
    └── hooks/           # Custom React hooks (theme preference, language, etc.)
    ```
-   **Package Management:** Use `pnpm` workspace tools at the monorepo root or package level.

## 2. Core Philosophy & Responsibilities

-   **Client-Side Processing (Crucial):** To save server bandwidth and cut infrastructure costs, the mobile app MUST extract audio from video files locally *before* uploading to the server.
-   **Direct-to-Cloud Uploads:** Upload media files directly to the cloud storage (MinIO/S3) using presigned URLs provided by the Backend API. Avoid passing large binary files through the NestJS backend.
-   **Async UX:** Generating subtitles using the AI Engine takes time. The app must provide a robust, offline-friendly UI, status polling (or SSE) for tracked media items, and clear "processing", "validating", or "failed" states.

## 3. Tech Stack & Standards

### 3.1. UI & Styling (`react-native-unistyles`)
-   Use `react-native-unistyles` for all styling to seamlessly handle responsive design and Light/Dark mode switching.
-   **Design Tokens:** Always use predefined design tokens for colors, spacing, typography, and radii from `src/theme/tokens.ts`. **Do not hardcode hex colors or arbitrary pixel values** in components. Update `src/theme/tokens.ts` if need to change or add new tokens.
-   **Icons:** Rely on `@expo/vector-icons` for scalable vector iconography.

### 3.2. State Management (Zustand)
-   Use **Zustand** for global state requirements (e.g., authentication session, user preferences).
-   Avoid redundant Redux-style boilerplate. Keep stores small, concise, and domain-specific.
-   Persist long-lived state (like theme preference, language preference) using `@react-native-async-storage/async-storage`.

### 3.3. API & Data Fetching (Axios)
-   All network requests should pass through centralized Axios instances in `src/services/api.ts`.
-   **Token Handling:** The Axios instance must include:
    -   Request interceptors to attach `Bearer` access tokens.
    -   Response interceptors to automatically handle `401 Unauthorized` errors smoothly by rotating the refresh token. Re-queue failed requests while the refresh is ongoing.
-   Persist tokens securely using `expo-secure-store` (do NOT use AsyncStorage for tokens).

### 3.4. Input Validation (Zod)
-   Use `zod` for validating inputs, parsing data, and ensuring type safety.
-   Ensure frontend validation schemas meticulously match backend validation rules (e.g., matching the `PASSWORD_REGEX` ensuring passwords are strong).

### 3.5. Localization (`i18next`)
-   The app must be fully bilingual up-front (Vietnamese as the default, English as the fallback).
-   No hardcoded UI strings. Use the `useTranslation` hook and map keys to the translation files in `src/i18n/locales/`.

## 4. Key Workflows / Feature Guidelines

### 4.1. Authentication Flow
-   **Verify-First System:** Users register -> receive an OTP email -> verify the OTP -> system finalizes creating the account and issues tokens.
-   **Layout Guards:** Utilize Auth Groups in Expo Router. Unauthenticated sessions are restricted to `/(auth)`. Verified/logged-in users enter `/(app)`.

### 4.2. Media Upload Flow
1.  **Selecting Media:** User picks a video or audio file from device storage or provides a YouTube link.
2.  **Local Extraction (Video Only):** If the asset is a video, parse out the audio using local tools (like `ffmpeg-kit-react-native`) to trim down the payload to standard audio formats (e.g., mp3/wav).
3.  **Presigned URL:** Request a PUT presigned URL using `POST /media/presigned-url`.
4.  **Upload:** Directly upload the audio to MinIO using the presigned URL, while observing upload progress.
5.  **Confirm:** Once uploaded, invoke `POST /media/confirm-upload` so the backend officially creates the `MediaItem` in DB and triggers the BullMQ processing pipeline.

### 4.3. Interactive Subtitle Player
-   **Multi-layer Rendering:** The player must support rendering source subtitles, translation subtitles, and phonetic (Pinyin/IPA) subtitles simultaneously.
-   **Karaoke Sync:** Active words must be highlighted dynamically synced to audio playback leveraging the timestamp arrays generated by the `ai-engine` JSON output.
-   **Dictionary Integration:** Hook up Gestures/Taps on individual words to pause the player and pull up dictionary definitions (`Vocabulary` and `UserVocabulary` endpoints).

## 5. Known Issues & Workarounds

-   **Windows Build Constraints:** Due to CMake path-length limits affecting the `react-native-unistyles` C++ compilation routines, keep the absolute path of the Kapter mobile project short (e.g., `C:\kapter\`) when running native Android builds (`expo run:android`) on Windows. This library restricts the use of standard Expo Go and necessitates a full development build or prebuild scenario.
    - **Possible Fix:**
    Download latest Ninja version on Github then add it to the path: `C:\Users\<YourUser>\AppData\Local\Android\Sdk\cmake\<VERSION>\bin\`

## 6. Stitch Design:
-   **ProjectId:** 17793727251035058796