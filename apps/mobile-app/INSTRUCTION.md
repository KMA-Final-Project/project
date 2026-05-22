# Mobile App - Agent Instruction

## 1. Module Role

`apps/mobile-app` is the client application that captures user intent, handles authenticated uploads, reflects processing state, and renders the interactive subtitle player. It is responsible for client-side audio extraction, direct-to-MinIO upload flow, socket-first progress UX, and incremental playback from translated subtitle batches.

## 2. Tech Stack

- Framework: Expo / React Native
- Routing: Expo Router
- State: Zustand
- Networking: Axios
- Validation: Zod
- Localization: i18next
- Styling: react-native-unistyles
- Package manager: `pnpm`

## 3. Directory Structure

```text
src/
|- entry.ts                    # Custom entry that initializes Unistyles and i18n
|- app/
|  |- _layout.tsx              # Root auth guard and session hydration
|  |- (auth)/                  # Login, register, verify-otp routes
|  `- (app)/                   # Library, upload, processing, player, settings routes
|- components/                 # Reusable UI primitives and auth components
|- services/
|  |- api.ts                   # Central Axios instance and interceptors
|  |- token-storage.ts         # expo-secure-store token persistence
|  `- auth/                    # Auth-specific API wrappers
|- stores/
|  `- auth.store.ts            # Zustand auth/session state
|- constants/                  # Endpoint and route constants
|- validations/                # Zod request/response validation schemas
|- types/                      # Shared DTO and app-facing types
|- theme/                      # Tokens, themes, and Unistyles config
|- i18n/                       # i18next setup and locale files
`- hooks/                      # Theme and language preference hooks
```

## 4. Core Philosophy

- Extract audio from video on the client before upload so the backend only receives audio payloads.
- Upload directly to MinIO through backend-issued presigned URLs instead of proxying large binaries through NestJS.
- Treat processing UX as socket-first; do not reintroduce aggressive polling for status or artifact queries.

## 5. Styling Rules

- Use `react-native-unistyles` for all styling.
- Pull colors, spacing, typography, and radii from `src/theme/tokens.ts`.
- Do not hardcode hex values or arbitrary pixel sizes in components.
- If a new design token is required, add it to `src/theme/tokens.ts` instead of bypassing the token system.
- Use `@expo/vector-icons` for iconography.

## 6. State & Auth

- Use Zustand for global state; the documented auth/session store is `src/stores/auth.store.ts`.
- Store access and refresh tokens with `expo-secure-store` through `src/services/token-storage.ts`; never use AsyncStorage for tokens.
- Route all API calls through `src/services/api.ts`.
- Preserve the Axios request interceptor that injects `Bearer` tokens and the response interceptor that rotates refresh tokens and re-queues failed requests during refresh.
- Use AsyncStorage only for long-lived UI preferences such as theme and language choice.

## 7. Key Workflows

### Upload Flow

1. `src/app/(app)/upload.tsx` and `src/app/(app)/media-picker.tsx` gather a local file or YouTube URL.
2. If the selection is video, extract audio locally before any upload request is made.
3. `src/services/api.ts` requests `POST /media/presigned-url`.
4. The client uploads directly to MinIO using the returned presigned URL.
5. `src/services/api.ts` then calls `POST /media/confirm-upload` or `POST /media/youtube`.
6. `src/stores/auth.store.ts` supplies the authenticated session context, and TanStack Query is used for media-library caching and refresh.

### Processing UX

1. The processing screen hydrates current state once from REST.
2. The app shell mounts a global `useSocketSync()` listener that patches TanStack Query caches from live processing events.
3. `/media/:id/artifacts` summaries and socket events drive readiness state; do not fall back to aggressive polling.

### Player Flow

1. `src/app/(app)/player.tsx` hydrates from available `translated_batches` before `final.json` exists.
2. Incoming translated-batch refreshes preserve the active subtitle session and avoid a full-screen reload.
3. Seek logic uses optimistic player time so scrubbing back into already-covered ranges clears pending state immediately.
4. `src/stores/auth.store.ts` still provides authenticated session state and `src/services/api.ts` remains the network entry point for follow-up dictionary or media calls.

## 8. Translation Layer Rule

Keep translation enabled by default. Auto-disable it only when subtitle metadata shows that source language and target language are the same.

## 9. Localization Rules

- Do not hardcode UI strings.
- Use `useTranslation` and the locale files under `src/i18n/locales/`.
- Vietnamese is the default language and English is the fallback.

## 10. Validation Checklist

```bash
pnpm lint
```

For native Android development on Windows, keep the repository path short before running `expo run:android`, and remember that `react-native-unistyles` requires a development build rather than Expo Go.
