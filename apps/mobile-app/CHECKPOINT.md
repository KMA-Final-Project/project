# Mobile App - Checkpoint

> Last updated: 2026-05-06
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

No single active mobile task is recorded in the imported checkpoint.

Use `Next Candidates` below as the current mobile backlog until a new task file or issue exists.

## 3. Recently Completed

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

- Player rendering polish is still pending.
  - Impact: core incremental player is shipped, but karaoke rendering, layer toggles, and long-session UX can be improved.
  - Current workaround: current player flow is usable for the existing demo path.

## 5. Next Candidates

- [ ] Improve karaoke playback rendering and active-word visual behavior.
- [ ] Add richer subtitle layer toggles for source, translation, phonetic, or karaoke views.
- [ ] Improve long-session player UX and memory behavior.
- [ ] Remove or repurpose unused preview-only helpers from the older processing preview flow.
- [ ] Add forgot-password flow.
- [ ] Add social login if still useful for the final product scope.
- [ ] Add vocabulary/dictionary UI once backend endpoints exist.
- [ ] Strengthen mobile validation with a typecheck script if the package does not already expose one.

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
