# Mobile App - Checkpoint

> Last updated: 2026-06-06
> Maintained by: agents - update this file after every significant change.

## 1. Current Status

Mobile App is in a working incremental-player state for the current project scope.

The module owns upload UX, authenticated session handling, direct-to-MinIO upload flow through backend presigned URLs, socket-first processing feedback, media library readiness state, settings, and the bilingual subtitle player.

The current app brand name is:

```text
Kapter
```

The active mobile product path is:

```text
Auth/session
  -> upload or YouTube submit
  -> backend media job
  -> socket-first processing updates
  -> artifact summary readiness
  -> translated batch hydration
  -> incremental player
  -> final subtitle output when available
```

## 2. Active Work

- [x] Manually verify Kapter Explain against a running backend/provider, then refine stream error/abort UX from device testing.
- [ ] Manually verify vocabulary lookup/save on device against the live backend, including active-word tap targets, free-tier limit handling, and Explain handoff.
- [ ] Manually verify iOS player lifecycle after the focus/blur playback fix, especially back-navigation stop behavior and pause stability across Explain and Lookup.

## 3. Recently Completed

- 2026-06-06 — Player blur cleanup and focused-instance playback sync. Status: Working.
  - Changed: Scoped player-to-store synchronization and Explain replay registration to the focused screen only, added explicit blur cleanup that pauses playback when leaving the player route, and hardened `useMediaPlayback` so pause always stops both underlying Expo audio/video players.
  - Why: iOS testing exposed a lifecycle bug where a blurred player screen inside the tab navigator could keep playing in the background and continue overwriting global player state, which made pause, Explain, and Lookup appear to auto-resume.
  - Validation: `pnpm lint`; `pnpm exec tsc --noEmit --pretty false`.
  - Follow-up: manual device verification on iOS for back-navigation, opening a second media item after leaving the first player, and pause behavior during Explain/Lookup.

- 2026-06-04 — Grouped Word Bank screen and Settings entry. Status: Working.
  - Added a new hidden app route `/(app)/word-bank` and a Settings entry that opens a grouped saved-vocabulary screen backed by the new authenticated backend `GET /vocabulary` contract.
  - Implemented TanStack Query Word Bank fetching, typed grouped response models, and a single-open inline accordion list that renders unique vocabulary rows with expandable historical save contexts.
  - Each expanded context now shows media identity, saved contextual definition, original subtitle line, saved translation, saved date, and a deep link back into the player when the media item is still available.
  - Why: the saved vocabulary surface needed to stay clean for repeated saves of the same word across different videos while preserving the exact learning snapshots.
  - Contract touchpoints: API, Player UX, Mobile navigation.
  - Validation: `pnpm lint`; `pnpm exec tsc --noEmit --pretty false`.
  - Follow-up: manual device verification for accordion feel, long-list performance, thumbnail rendering, and player deep-link behavior.

- 2026-05-27 — Enforce onboarding screen flow after sign in. Status: Working.
  - Changed: Modified the root layout `_layout.tsx` auth guard to reset onboarding state via `resetOnboarding()` and redirect the user to the onboarding flow whenever they are detected as authenticated inside the auth group (`(auth)`). Commented out the old logic that bypassed onboarding for already-completed sessions.
  - Why: Simplifies showing/testing the onboarding flow during the demo day.
  - Validation: `pnpm lint` and `pnpm exec tsc --noEmit` passed.
  - Follow-up: Verify on the device that logging in triggers the full onboarding flow from step 1 even if previously completed.

- 2026-05-25 — Lookup bookmark tap-guard and visible saving state. Status: Working.
  - Hardened the player lookup save handler with a synchronous in-flight token guard so repeated taps cannot enqueue parallel bookmark requests before React re-renders the card.
  - Kept the lookup card save control visibly in its saving state for the active save token and prevented stale save completions from mutating a newer lookup selection.
  - Why: rapid bookmark taps could bypass the previous render-time-only disable path, which made the button feel not fully loading-safe and triggered duplicate backend save requests.
  - Validation: `pnpm lint`; `pnpm exec tsc --noEmit --pretty false`.
  - Follow-up: verify on device that the save button visibly locks immediately on first tap and stays stable while rapidly tapping.

- 2026-05-25 — Floating vocabulary lookup card and active-word player taps. Status: Working.
  - Added mobile endpoint constants and typed lookup/save DTOs aligned to the live `POST /media/:id/lookup` and `POST /media/:id/lookup/bookmark` backend contract.
  - Implemented a dedicated `useVocabularyLookup` hook for atomic lookup fetches and explicit Save Word requests through the authenticated mobile API client.
  - Reworked the active subtitle row so only the current sentence exposes per-word tap targets, while inactive rows keep the existing row-level seek behavior.
  - Added a floating lookup card overlay in the player with fixed-height loading skeleton, contextual definition, localized part-of-speech pill, inline save state, and sentence-level Explain handoff.
  - Why: the player needed a fast single-tap vocabulary surface that stays lighter than Kapter Explain while still matching the approved backend lookup contract.
  - Contract touchpoints: API, Player UX, Subtitle JSON.
  - Validation: `pnpm lint`; `pnpm exec tsc --noEmit --pretty false`.
  - Follow-up: device verification for overlay placement on small screens, repeated word retaps, saved-state persistence, and free-tier lookup-limit messaging.

- 2026-05-25 — Explain sheet now shows immediate pending state and drains streamed answers without requiring reopen. Status: Working.
  - Added an optimistic assistant pending bubble in `useExplainStream`, reconciled it with the backend `meta.messageId`, and hardened the SSE parser so any final buffered event block is processed even if the transport flushes late.
  - Updated `ExplainBottomSheet` to render a visible thinking row with animation (`ActivityIndicator`) instead of a blank waiting state, and tightened `FlatList` interaction props for the chat surface.
  - Why: opening a fresh Explain session previously showed no clear sending/thinking state, and some replies only became visible after closing and reopening the sheet because the live stream path was not surfacing state reliably enough.
  - Validation: `pnpm lint`; `pnpm exec tsc --noEmit --pretty false`.
  - Follow-up: manual device verification against a live backend to confirm first-turn thinking visibility, streamed delta rendering, and stop/abort behavior on both Android and iOS.

- 2026-05-25 — Explain sheet initialization no longer self-aborts live streams. Status: Working.
  - Reworked the Explain sheet bootstrap effect so it no longer depends directly on the `start` callback identity from `useExplainStream`. The latest `loadHistory`, `start`, and seeded initial-message values now flow through refs, so flipping `isStreaming=true` no longer retriggers the effect cleanup and aborts the request immediately after it begins.
  - Why: the previous effect cleanup path matched the user-visible bug exactly: the sheet showed the thinking indicator, then silently aborted the active stream, while the backend could still finish and persist the answer that only appeared after reopening history.
  - Validation: `pnpm lint`; `pnpm exec tsc --noEmit --pretty false`.
  - Follow-up: live device verification for first-turn explain and follow-up explain on the same open sheet.

- 2026-05-25 — Explain drawer long-sentence context and drag-progress refinement. Status: Working.
  - Expanded the sentence drawer to show the full selected source sentence and translated layer before the phonetic word strip, so long selections no longer collapse to a single visible line.
  - Changed the drawer gesture so the pill can be held and dragged upward or downward with continuous open/close progress instead of only snapping at gesture end.
  - Paused the player when opening Explain so the chat session begins from a stable playback state.
  - Validation: `pnpm lint`; `pnpm exec tsc --noEmit --pretty false`.
  - Follow-up: manual device verification for drag feel, long-context overflow, and exact expanded-height tuning on smaller screens.

- 2026-05-25 — Explain drawer interaction correction and frozen explain selection. Status: Working.
  - Moved bottom-sheet drag handling to the top sheet handle only so chat scrolling no longer drags the whole sheet.
  - Reworked the sentence drawer into a collapsed pill that expands above the input tray, removed the visible "Sentence drawer/Ngăn câu" label, and kept playback/speed controls inside the expanded drawer only.
  - Froze the selected sentence and segment index when Explain opens so replaying audio no longer rebinds the sheet to the live subtitle cursor or refetches explain history mid-session.
  - Added the current translation line into the seeded first-turn explain message so the chosen sentence now displays both source and translated context.
  - Validation: `pnpm lint`; `pnpm exec tsc --noEmit --pretty false`.
  - Follow-up: manual device verification for pill drag feel, expanded drawer spacing, and chat-scroll gesture behavior on iOS/Android.

- 2026-05-24 — Explain drawer correction: native playback controls, horizontal card layout. Status: Working.
  - Removed the synthetic `expo-speech` drawer path and rebuilt the sentence drawer as an inline floating card above the Explain input tray instead of an intrusive absolute overlay inside the message viewport.
  - The drawer now renders horizontal word columns (phonetic on top, word below), slides open and closed from the bottom area, and no longer blocks explain-message scrolling.
  - Wired the drawer controls to player-store-backed transport hooks so replay uses the active native media stream from the sentence start timestamp, while speed cycling reuses the existing global playback-speed action.
  - Validation: `pnpm lint`; `pnpm exec tsc --noEmit --pretty false`.
  - Follow-up: manual device verification for exact bottom-sheet spacing, animation feel, and partial-coverage replay behavior.

- 2026-05-24 — Kapter Explain UI overhaul, implicit target-language ingestion, and floating sentence drawer. Status: Working.
  - Replaced the pinned explain context card with a chat-first bottom sheet that seeds the conversation using a localized first user bubble tied to the active media target language.
  - Added a floating sentence drawer for word-by-word phonetic access above the input tray and kept playback tied to the native player stack.
  - Removed the YouTube modal target-language picker; the modal now submits only source-language choice plus the persisted onboarding target-language preference in the background request payload.
  - Updated player/media typing so the Explain UI prefers the media item's canonical `targetLanguage` from backend status/library responses before falling back to onboarding defaults.
  - Contract touchpoints: API, Language, Player UX.
  - Validation: `pnpm lint`; `pnpm exec tsc --noEmit --pretty false`.
  - Follow-up: manual device verification for drawer overlap, long markdown scrolling, and pronunciation behavior in a dev build.

- 2026-05-24 — Kapter Explain Phase 1 mobile contract types. Status: In-Progress.
  - Added mobile endpoint constants for explain stream, history, and feedback API routes.
  - Added shared mobile Explain request/event/history/feedback types aligned to `CONTRACTS.md`.
  - The mobile request type intentionally excludes subtitle text, translations, phonetics, words, and language metadata; backend resolves canonical segment context server-side.
  - Contract touchpoints: API, Quota, Subtitle JSON.
  - Validation: `pnpm lint`.
  - Follow-up: add the player Explain button flow, SSE adapter, cached response rendering, and feedback UX.

- 2026-05-24 — Kapter Explain player bottom sheet and SSE client. Status: Partial.
  - Wired the player Explain control to open a chat bottom sheet for the active subtitle segment.
  - Added `useExplainStream` using Expo SDK 54 streaming `fetch` with `ReadableStream.getReader()` and `AbortController` to consume backend SSE events.
  - The mobile request payload sends only `segmentIndex`, optional `sessionId`, and optional `userMessage`; subtitle text is displayed locally but not sent to the backend.
  - Added chat history loading, streaming assistant bubbles, stop/abort, follow-up input, credits display, and feedback actions.
  - Contract touchpoints: API, Quota, Subtitle JSON.
  - Validation: `pnpm lint`; `pnpm exec tsc --noEmit`.
  - Follow-up: manual device/emulator test against local backend + Redis/MinIO/provider credentials; tune keyboard behavior and long-message rendering from real stream data.

- 2026-05-23 — Subtitle Player Screen Refactoring. Status: Working.
  - Implemented vertical inline word-level phonetic stack layout in `SubtitleRow.tsx` (pinyin/phoneme on top for CJK, below for non-CJK).
  - Synced active karaoke word and phonetic highlights synchronously in real-time.
  - Refactored `PlayerControls.tsx` container into a modern floating pill with diffuse drop shadow and margin offsets.
  - Designed the 5-button control bar layout: `Pin`, `Explain` (placeholder), `Play/Pause` (Squircle), `Repeat`, and `Speed`.
  - Converted speed cycling pressable into a modal-based dropdown selector, enabling user-friendly speed choices.
  - Implemented `isPinned` store state/action and modified `player.tsx` auto-scroll FlatList logic to bypass scroll when active.
  - Fixed a race condition where translation layer auto-disable is triggered on initial empty loading states, resetting `showTranslation` prematurely. Added loading guards to prevent this behavior.
  - Cleared unused imports/variables to resolve all linting and compiler warnings.

- 2026-05-23 — YouTube Pre-Flight Configuration Panel & i18n support. Status: Working.
  - Implemented reusable Dropdown component with squircle borders matching Kapter's brand identity.
  - Injected side-by-side dropdown pickers for Source Language (`Auto detect`, `Chinese (zh)`, `English (en)`) and Target Language (`Tiếng Việt (vi)`, `English (en)`) inside the YouTube Video Modal.
  - Programmed automatic state reset hook based on `useOnboarding()` default target language defaults.
  - Added micro-text warning presenting quota utilization constraints.
  - Updated axios mutations and schemas to support `sourceLanguage` and `targetLanguage` fields.

- 2026-05-23 — Visual refactoring, thumbnail ingestion, and bottom tab bar refactoring. Status: Working.
  - Installed `expo-video-thumbnails` library via `npx expo install`.
  - Refactored `useUploadMedia` hook in `useMedia.ts` to capture the first frame of local video files, upload it to the pre-generated `thumbnailUploadUrl` in MinIO, and confirm the upload with `hasThumbnail: true`.
  - Redesigned `MediaCard.tsx` with a modern 16:9 cinematic aspect ratio cover, source type indicators, duration overlays, and a dynamic gradient + vertical-animated waveform fallback for pure audio files.
  - Implemented collapsible header animation in `(app)/index.tsx` (brand name fades/scales and search/filters translate out on scroll).
  - Refactored bottom navigation tab bar in `(app)/_layout.tsx` using a custom `CustomTabBar` rendering component to completely bypass React Navigation layout clipping constraints. The bar is a compressed (62% screen-width) Floating Pill Tab Bar, centered horizontally, featuring a geometric Squircle `+` action button that fits entirely inside the bar's vertical boundary (68px).
  - Custom rendered Library and Settings tabs with custom dynamic active state capsule pods cocooning the vector icon and micro-font size labels (`fontSize: 10`), leaving inactive tabs muted.
  - Adjusted bottom paddings in `index.tsx` and `settings.tsx` to clear the floating bottom navigation bar.

- 2026-05-20 — Kapter V1 Production Userflow marked complete. Status: Working.
  - Implemented App welcome screen and detailed onboarding pipeline (Language preference, subtitle defaults, learning targets).
  - Formulated AsyncStorage-backed global onboarding state hooks.
  - Refined Library search/filters/empty views, media picker device library scanner, and YouTube integration.
  - Configured socket-driven processing timelines and automatic artifact refetching on COMPLETED status.
  - Implemented interactive player layer views (phonetic, source, translation) and speed/auto-disable rules.
  - Built comprehensive settings tab with dynamic quota tracking bar, interface language switcher, and state-wipe logout.
  - Verified 100% clean TypeScript compiler and linter execution with 0 warnings/errors.

- 2026-04-02 — UI/UX foundation marked complete. Status: Working.
  - Theme token system.
  - Light/dark theme support.
  - Vietnamese default and English fallback localization.
  - Custom app entry initialization.
  - Demo screen and base UI primitives.

- 2026-04-02 — Auth flow and route guard marked complete. Status: Working.
  - Zustand auth store.
  - Secure token storage through `expo-secure-store`.
  - Axios auth and refresh-token interceptors.
  - Login/register segmented screen.
  - Verify OTP screen.
  - Root navigation guard.

- 2026-04-02 — Upload flow and media pipeline integration marked complete. Status: Working.
  - Local upload through presigned URL PUT and confirm flow.
  - YouTube modal ingestion.
  - TanStack Query for library caching.
  - Socket-first status hydration.
  - Backend API compatibility fixes.

- 2026-04-02 — Processing detail and artifact flow marked complete. Status: Working.
  - Global `useSocketSync()` listener patches TanStack Query caches.
  - Processing screen hydrates status once via REST, then relies on socket updates.
  - `GET /media/:id/artifacts` drives completed-output summary and resumed state.
  - Library readiness badge appears when translated batches exist.
  - Open Player CTA appears as soon as translated output exists.

- 2026-04-02 — Incremental player screen marked complete. Status: Working.
  - Player hydrates from `translated_batches/` before `final.json` exists.
  - Incoming translated batches preserve the active subtitle session.
  - Optimistic seek/loading logic clears pending state when scrubbing into covered ranges.
  - Translation layer defaults on and auto-disables only when source and target languages match.
  - YouTube submissions preserve preview titles, with backend metadata fallback.

## 4. Known Issues

- `react-native-unistyles` Windows native build path-length issue.
  - Impact: `expo run:android` can fail with CMake errors when the repository path is too long.
  - Current workaround: clone or move the repository to a short absolute path such as `C:\kapter\`.
  - Related areas: Windows Android development, native modules, CMake, `react-native-unistyles`.

- Expo Go is not sufficient for full native validation.
  - Impact: native behavior that depends on `react-native-unistyles` requires a development build.
  - Current workaround: use `expo run:android`, `expo run:ios`, or dev-client flow when native validation is required.

## 5. Next Candidates

- [ ] Add richer subtitle layer toggles for source, translation, phonetic, or karaoke views.
- [ ] Improve long-session player UX and memory behavior.
- [ ] Remove or repurpose unused preview-only helpers from the older processing preview flow.
- [ ] Add forgot-password flow.
- [ ] Add social login if still useful for the final product scope.
- [ ] Add device-verified polish for vocabulary lookup placement, error copy, and bookmark feedback once the first round of live testing is complete.
- [ ] Strengthen mobile validation with a typecheck script if the package does not already expose one.
- [ ] Replace the mobile-side raw explain SSE parser with the same official SDK-backed or typed-stream approach once Expo/runtime constraints and product scope justify it.

## 6. Contract Touchpoints

### Backend API

Mobile consumes:

- auth endpoints;
- upload presigned URL endpoint;
- upload confirmation endpoint;
- YouTube submission endpoint;
- media status endpoint;
- artifact inventory endpoint;
- media library endpoint.

### Artifact Contract

Mobile player and processing UX depend on:

```text
processed/{mediaId}/translated_batches/
processed/{mediaId}/final.json
```

The player can open before `final.json` exists when translated batches are available.

### Socket Contract

Mobile processing UX expects socket-first updates mirrored by the backend from AI Engine events.

Important event concepts:

- progress update;
- chunk ready;
- translated batch ready;
- completion;
- failure.

Do not reintroduce aggressive polling when socket events and artifact summaries already cover the use case.

### Subtitle JSON

Mobile player depends on segment fields such as:

- `start`
- `end`
- `text`
- `translation`
- `phonetic`
- `words`

Any change to AI Engine subtitle output shape is a cross-module change.

### Styling and Localization

Mobile UI depends on:

- `react-native-unistyles`;
- tokens from `src/theme/tokens.ts`;
- i18next locale files;
- Vietnamese default and English fallback.

Do not hardcode UI strings, colors, or arbitrary styling values.

## 7. Validation Notes

Standard mobile validation:

```bash
cd apps/mobile-app
pnpm lint
```

Native Android validation, when required and environment is ready:

```bash
cd apps/mobile-app
pnpm dlx expo run:android
```

or use the package script if defined:

```bash
pnpm android
```

Recommended extra check if available:

```bash
pnpm typecheck
```

or:

```bash
pnpm tsc --noEmit
```

Last imported verification state:

- Old checkpoint recorded phases 1 through 5 as done.
- No fresh command output is available in this generated checkpoint.

## 8. Update Rules

Update this checkpoint when:

- Upload flow changes.
- Processing UX or socket sync behavior changes.
- Player hydration/rendering behavior changes.
- Auth/session behavior changes.
- API response shape assumptions change.
- Styling or localization architecture changes.
- A native build issue is discovered or resolved.
- A dependency is added or upgraded.
- A validation result changes the known state.

Do not add long UI architecture explanations here. Move stable rules to `INSTRUCTION.md`, cross-module contracts to a future `CONTRACTS.md`, and historical context to `docs/archive/`.
