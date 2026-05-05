# Mobile App - Checkpoint

> Last updated: 2026-05-06
> Maintained by: agents - update this file after every significant change.

## Current Status

| Area                                | Status      | Notes                                                                                                                |
| ----------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| UI/UX foundations                   | Working     | Theme tokens, dark mode, i18n, and the custom entry initialization are documented as done.                           |
| Auth flow and route guard           | Working     | Zustand auth state, secure token storage, Axios refresh flow, and auth-route gating are documented as done.          |
| Upload flow integration             | Working     | Local upload, YouTube ingestion, TanStack Query library caching, and backend pipeline wiring are documented as done. |
| Processing detail and artifact flow | Working     | Global socket sync, artifact-summary hydration, and player CTA readiness are documented as done.                     |
| Incremental player screen           | Working     | The player hydrates from `translated_batches` before `final.json` and preserves state across batch refreshes.        |
| Player polish backlog               | In-Progress | Karaoke playback polish and richer subtitle rendering remain as follow-up work.                                      |

## Active Pipeline / Architecture Notes

- `src/entry.ts` initializes Unistyles and i18n before the router mounts.
- `src/app/_layout.tsx` hydrates auth state and redirects between `/(auth)` and `/(app)` route groups.
- `src/stores/auth.store.ts` is the documented global auth/session store.
- `src/services/api.ts` owns bearer-token injection and 401 refresh handling.
- The app shell mounts `useSocketSync()` to patch TanStack Query caches from live processing updates.
- The completed-player flow is artifact-first: translated batches unlock playback before `final.json` exists.
- Translation defaults on and auto-disables only when subtitle metadata reports identical source and target languages.

## Known Issues & Workarounds

- `react-native-unistyles` can fail native Android builds on Windows because of CMake path-length limits.
- Workaround: move the repository to a shorter absolute path before running `expo run:android`.
- Additional workaround: install a recent Ninja binary into the Android CMake `bin` directory if needed.
- This app cannot rely on standard Expo Go for the documented native workflow; use a development build or prebuild path instead.

## Environment & Commands

```bash
pnpm lint
expo run:android
```

Use `expo run:android` only after accounting for the Windows path-length constraint documented above.

## Recent Changes

| Date       | Change                                                                                                                            | Author              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 2026-04-10 | Root checkpoint records Phases 1 through 5 as shipped: foundations, auth, upload flow, processing detail, and incremental player. | existing checkpoint |
| 2026-05-06 | Split mobile-specific status into `apps/mobile-app/CHECKPOINT.md`.                                                                | agent               |

## Follow-up Items

- Continue karaoke playback polish and richer subtitle rendering inside the player.
- Remove or repurpose any remaining preview-only helpers now that the processing screen is artifact-summary-first.
- Add forgot-password and social-login flows when that work is prioritized.
