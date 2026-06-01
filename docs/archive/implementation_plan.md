# Kapter Mobile App V1 Implementation Plan

This document outlines the concrete implementation plan for the **Kapter mobile app V1 production userflow**.

## 1. Current State Summary

Based on the repository inspection, the mobile app currently has a solid foundation shipped:
- **Architecture**: React Native, Expo Router, Zustand (stores for auth, media, player), Axios, i18next, and `react-native-unistyles` configured.
- **Auth/Session**: `(auth)` routes exist (`index.tsx`, `verify-otp.tsx`) with segmented login/register and token management via `expo-secure-store`. `auth.store.ts` manages Zustand state and Axios interceptors handle refresh logic.
- **Library & Upload**: `(app)/index.tsx`, `upload.tsx`, and `media-picker.tsx` cover the main views. Direct-to-MinIO presigned upload and YouTube ingestion are integrated with TanStack Query caching.
- **Processing**: `(app)/processing.tsx` hydrates initially from REST and then patches state via `useSocketSync()` listening to mirrored Redis Pub/Sub events.
- **Player**: `(app)/player.tsx` is built for incremental loading from `translated_batches` before `final.json` exists. It supports karaoke timing and bilingual layers.
- **Settings & Theme**: `settings.tsx` is present. Design tokens (`src/theme/tokens.ts`) and light/dark modes are available. Vietnamese is the default language.

**Known Constraints**: `react-native-unistyles` path-length issue on Windows. Expo Go cannot be used for native validation.

## 2. Proposed V1 Information Architecture

The proposed structure refines the current layout to support onboarding and proper dynamic routing for media items.

```text
src/app/_layout.tsx
src/app/(auth)/welcome.tsx                (NEW)
src/app/(auth)/index.tsx                  (EXISTING - Login/Register)
src/app/(auth)/verify-otp.tsx             (EXISTING)

src/app/(app)/_layout.tsx
src/app/(app)/onboarding/app-language.tsx       (NEW)
src/app/(app)/onboarding/target-language.tsx    (NEW)
src/app/(app)/onboarding/learning-languages.tsx (NEW - Optional)

src/app/(app)/index.tsx                   (EXISTING - Home/Library)
src/app/(app)/upload.tsx                  (EXISTING)
src/app/(app)/media-picker.tsx            (EXISTING)
src/app/(app)/processing/[id].tsx         (RENAME/REFACTOR from processing.tsx)
src/app/(app)/player/[id].tsx             (RENAME/REFACTOR from player.tsx)
src/app/(app)/settings.tsx                (EXISTING)
```

## 3. Screen-by-Screen UX Plan

### Welcome Screen (`(auth)/welcome.tsx`)
- **Goal**: Introduce Kapter's value proposition.
- **Entry**: Unauthenticated users launching the app for the first time.
- **Main UI**: Hero illustration/logo, brief bilingual subtitle pitch.
- **Actions**: "Get Started" (navigates to Login/Register).
- **Dependencies**: Static content.

### Login/Register & Verify OTP (`(auth)/index.tsx`, `(auth)/verify-otp.tsx`)
- **Goal**: Capture user credentials and verify OTP.
- **Entry**: "Get Started" from Welcome.
- **Main UI**: Segmented tabs for Login / Sign Up. Email/password inputs. OTP input.
- **States**: Loading indicators during submission. Error toasts for invalid credentials.
- **Dependencies**: `POST /auth/login`, `POST /auth/register`, `POST /auth/verify`.

### Onboarding: App Language (`(app)/onboarding/app-language.tsx`)
- **Goal**: Set the `appLanguage` for UI strings.
- **Entry**: First login (tracked via an `hasCompletedOnboarding` flag).
- **Main UI**: List of supported UI languages (Vietnamese default, English).
- **Actions**: Select language -> Continue.
- **Dependencies**: Updates AsyncStorage and `i18next` locale.

### Onboarding: Default Translation (`(app)/onboarding/target-language.tsx`)
- **Goal**: Set the user's default `targetLanguage` for processing.
- **Main UI**: Searchable list of supported AI Engine translation languages.
- **Actions**: Select target language -> Continue.
- **Dependencies**: Updates `targetLanguage` preference in AsyncStorage.

### Onboarding: Watched/Studied Languages (`(app)/onboarding/learning-languages.tsx`)
- **Goal**: Capture optional personalization data (`learningLanguages`).
- **Main UI**: Multi-select pill list of languages.
- **Actions**: "Skip" or "Select & Finish".
- **Dependencies**: Updates AsyncStorage. Sets `hasCompletedOnboarding = true`.

### Home / Library (`(app)/index.tsx`)
- **Goal**: Display user's media.
- **Main UI**: Grid or list of `MediaCard` components. Floating Action Button (FAB) for "Create".
- **States**: 
  - *Empty*: Friendly illustration with "Upload a video or paste a YouTube link to start."
  - *Loading*: Skeleton list.
  - *Error*: "Failed to load library" + Retry button.
- **Actions**: Tap card to open Player or Processing depending on status.
- **Dependencies**: `GET /media` cached via TanStack Query.

### Create / Upload (`(app)/upload.tsx`, `media-picker.tsx`)
- **Goal**: Capture new media intent and start the job.
- **Main UI**: Options for Local Video/Audio or YouTube Link.
- **Pre-processing setup**: Confirmation of `sourceLanguage` (auto-detect by default) and `targetLanguage` (pre-filled from defaults). Quota usage preview.
- **Actions**: "Submit Job".
- **Dependencies**: `POST /media/presigned-url`, `POST /media/confirm-upload`, `POST /media/youtube`.

### Processing Detail (`(app)/processing/[id].tsx`)
- **Goal**: Show live backend processing status without aggressive polling.
- **Main UI**: `ProcessingTimeline` showing stages (Upload, VAD, Aligning, Translating).
- **Actions**: "Open Player" CTA (enabled *only* when translated batches exist).
- **Dependencies**: Hydrates once from `GET /media/:id/status` and `GET /media/:id/artifacts`, then updates via `useSocketSync()`.

### Player (`(app)/player/[id].tsx`)
- **Goal**: Render bilingual subtitles with karaoke word-level timing.
- **Main UI**: Video/Audio player surface. Scrollable/syncing subtitle list. `SubtitleLayerToggle` (Source / Translation).
- **States**: Incremental loading gracefully adds new batches without reloading.
- **Dependencies**: Hydrates from `processed/{mediaId}/translated_batches/` or `final.json`.

### Settings (`(app)/settings.tsx`)
- **Goal**: Manage user preferences and session.
- **Main UI**: Sections for Account, Preferences (App language, Target language, Theme), and Quota (placeholder).
- **Actions**: "Log Out".
- **Dependencies**: Clears SecureStore and Zustand auth on logout.

## 4. Component Plan

- **`AppScreen`**: Main screen wrapper handling safe areas and common backgrounds.
- **`AppHeader`**: Standardized navigation header with title and back action.
- **`PrimaryButton` / `SecondaryButton`**: Reusable touchables using brand tokens.
- **`MediaCard`**: Displays thumbnail, title, status badge, and duration.
- **`ProcessingTimeline`**: Visual stepper showing progress through validation, processing, and translation.
- **`QuotaUsageCard`**: Placeholder UI showing limits (e.g., "45 / 120 mins used").
- **`LanguageOptionCard`**: Selectable row for onboarding and settings.
- **`SubtitleLayerToggle`**: Segmented control or switches for Source/Translation visibility.
- **`EmptyState` / `ErrorState`**: Standardized fallback views with illustrations and actions.

## 5. State Management Plan

- **Zustand (`auth.store.ts`)**: Manages session (accessToken, user identity).
- **Zustand (`media.store.ts` / `player.store.ts`)**: Manages local player config and live processing status patched by sockets.
- **AsyncStorage**:
  - `hasCompletedOnboarding` (boolean)
  - `appLanguage` ('vi' | 'en')
  - `defaultTargetLanguage` (string)
  - `learningLanguages` (string[])
  - `theme` ('system' | 'light' | 'dark')
- **SecureStore**: Stores tokens exclusively (`accessToken`, `refreshToken`).
- **TanStack Query**: Caches `GET /media` and individual media status, patched by socket events.

## 6. API Integration Plan

| Endpoint | Status | Usage |
|---|---|---|
| `POST /auth/login`, `register`, `verify` | Existing | Authenticate user. |
| `GET /media` | Existing | Fetch library. |
| `POST /media/presigned-url` | Existing | Initiate local upload. |
| `POST /media/confirm-upload` | Existing | Finalize local upload. |
| `POST /media/youtube` | Existing | Submit YT link. |
| `GET /media/:id/status` | Existing | Initial processing hydration. |
| `GET /media/:id/artifacts` | Existing | Initial artifact hydration (detects batches). |
| `GET /users/me/subscription` | Needs verification / Missing | Quota display in Settings/Upload. |

## 7. i18n Plan

**Namespaces**: `common`, `auth`, `onboarding`, `library`, `upload`, `processing`, `player`, `settings`.

**Example Keys**:
- `auth.welcomeTitle`: "Turn media into a bilingual workspace"
- `onboarding.selectAppLanguage`: "Choose app language"
- `upload.quotaWarning`: "You have {{minutes}} minutes remaining this month."
- `processing.openPlayer`: "Start Watching (Translating in background...)"

## 8. Styling and Theme Plan

All UI development will strictly use `react-native-unistyles`.
- Colors must be referenced from `theme.colors` (mapped from `src/theme/tokens.ts`).
- Spaces and radii must use `theme.spacing` and `theme.radii`.
- **No hardcoded HEX values** like `#FFF` or pixel margins like `margin: 15`.

## 9. Edge Cases and Error States

- **Expired Session**: Axios interceptor handles refresh. If refresh fails, automatically dispatch logout and navigate to Welcome.
- **Upload Interrupted**: Show localized error toast. Allow retry from the upload screen.
- **Invalid YouTube URL**: Validation via Zod before backend submission.
- **Quota Exceeded**: Disable "Submit Job" button. Show warning inside `QuotaUsageCard`.
- **Processing Failed**: Render `ErrorState` on `(app)/processing/[id].tsx` with the localized failure reason from the backend.
- **Source = Target Language**: Auto-disable the translation layer toggle in the Player.

## 10. Phased Implementation Plan

### Phase 1: Audit and Route Map
- **Changes**: Rename `processing.tsx` and `player.tsx` to dynamic routes `[id].tsx`. Add `welcome.tsx` and onboarding directory.
- **Acceptance Criteria**: Expo Router resolves all paths correctly without 404s.

### Phase 2: Onboarding Preferences
- **Changes**: Implement `welcome.tsx` and the onboarding flow screens. Read/write to AsyncStorage.
- **Acceptance Criteria**: New users route through onboarding; returning users bypass it.

### Phase 3: Library/Home Production Polish
- **Changes**: Refine `(app)/index.tsx`. Build `MediaCard`, `EmptyState`, and `ErrorState` components using tokens.
- **Acceptance Criteria**: Home screen matches premium UI expectations with proper empty states.

### Phase 4: Create/Import Flow Polish
- **Changes**: Refine `upload.tsx` and `media-picker.tsx`. Add `QuotaUsageCard` placeholder.
- **Acceptance Criteria**: User can successfully start local and YouTube jobs. Zod validation active.

### Phase 5: Processing Detail Polish
- **Changes**: Refine `[id].tsx` for processing. Build `ProcessingTimeline`.
- **Acceptance Criteria**: "Open Player" CTA activates dynamically when `batch_ready` socket event triggers.

### Phase 6: Player Layer UX Polish
- **Changes**: Refine `player/[id].tsx`. Implement `SubtitleLayerToggle`. Polish karaoke highlight.
- **Acceptance Criteria**: Player accurately hides/shows layers. Auto-disables translation if languages match.

### Phase 7: Settings & Final Cleanup
- **Changes**: Refine `settings.tsx`. Hook up theme/language toggles to Unistyles/i18next. Run pnpm lint and typechecks.
- **Acceptance Criteria**: Preferences apply immediately. No hardcoded strings remain.

## 11. Acceptance Criteria

- [ ] New user can complete auth and onboarding.
- [ ] User can choose `appLanguage` and `defaultTargetLanguage`.
- [ ] Library empty state directs user to create subtitles.
- [ ] User can submit local media or YouTube link using existing flow.
- [ ] Processing screen hydrates once then relies on socket updates.
- [ ] "Open Player" CTA appears when translated batches exist.
- [ ] Player opens before `final.json` when translated batches are available.
- [ ] Settings can update app language, theme, and default target language.
- [ ] No hardcoded UI strings are introduced.
- [ ] No hardcoded colors/spacing are introduced.
- [ ] `pnpm lint` and `pnpm tsc --noEmit` pass.

## 12. Risks and Non-goals

**Non-goals**:
- Full billing implementation (only read existing quotas).
- Advanced export systems.
- Admin dashboard.
- Dictionary/Flashcards (placeholder or hidden until backend API is ready).
- Aggressive polling fallback for sockets.

## 13. Questions / Missing Info

> [!WARNING]
> - Are the subscription endpoint schemas (`GET /users/me/subscription`) defined and available on the backend to render the Quota Usage cards, or should I mock the hook entirely for V1?
> - Does the current `react-native-unistyles` path-length issue on Windows block any immediate Expo Go layout tasks, or can we proceed with UI work in Expo Go and test native behavior later?

---
*Recommended first step:* **Phase 1: Audit and Route Map** to restructure Expo Router files and establish the onboarding navigation guard.
