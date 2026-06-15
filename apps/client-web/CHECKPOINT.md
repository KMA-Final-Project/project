# CHECKPOINT.md — apps/client-web

## Current Status

Mobile-web billing handoff implemented — /handoff route, Return to app button, checkout URL preservation, and single-column pricing cards for the mobile handoff browser.

## Active Work

- None currently

## Recently Completed

- 2026-06-13 — Mobile pricing handoff responsive stacking. Status: Working.
  - The client-web pricing page now detects `fromMobile=1` and switches the plan list into a mobile-handoff layout that stacks every plan card in a single column.
  - Narrowed the pricing container in that handoff context so the in-app browser no longer compresses the paid tiers off-screen behind the free plan card.
  - Added a regression test covering the mobile handoff layout marker on `/pricing?fromMobile=1`.
  - Why: users opening upgrade from the mobile app could not reliably see paid plans in the handoff browser, which blocked subscription upgrades.
  - Validation: `pnpm --filter client-web typecheck`; `pnpm --filter client-web lint`; `pnpm --filter client-web test`; `pnpm --filter client-web build`.
  - Follow-up: run a device-level pass through the Expo billing handoff once the local browser automation runtime has Playwright browsers installed.

- 2026-06-10 — Mobile-web billing handoff. Status: Working.
  - `/handoff` route: consumes one-time token, stores session, redirects to pricing or subscription with `fromMobile=1`
  - `ReturnToApp` component: visible on pricing/account/success/cancel pages when `fromMobile=1`
  - Checkout success/cancel URLs preserve `fromMobile=1`
  - Contract touchpoints: Auth (handoff consume endpoint). See CONTRACTS.md Section 5.8.
  - Validation: `pnpm build`, `pnpm lint` pass.

- 2026-06-09 — UI/UX redesign and brand alignment
  - Status: Working
  - Changed:
    - [index.html](file:///c:/Users/sondo/my_projects/KMA/billingual_project/apps/client-web/index.html) (imported Outfit font, renamed title to Kapter)
    - [src/index.css](file:///c:/Users/sondo/my_projects/KMA/billingual_project/apps/client-web/src/index.css) (realigned HSL variables to brand logo, added glassmorphic and shimmer utilities)
    - [src/features/billing/pages/pricing-page.tsx](file:///c:/Users/sondo/my_projects/KMA/billingual_project/apps/client-web/src/features/billing/pages/pricing-page.tsx) (implemented case-insensitive billing cycle matching to fix wrong labels, added human-readable quota formatting, and completely redesigned plan cards with premium gradients, star badges, and hover animations)
    - [src/shared/components/navbar.tsx](file:///c:/Users/sondo/my_projects/KMA/billingual_project/apps/client-web/src/shared/components/navbar.tsx) (floating sticky pill, brand logo icon, integrated working language switch showing active locale)
    - [src/shared/components/footer.tsx](file:///c:/Users/sondo/my_projects/KMA/billingual_project/apps/client-web/src/shared/components/footer.tsx) (restructured into modern link columns, brand logo, description)
    - [src/layouts/auth-layout.tsx](file:///c:/Users/sondo/my_projects/KMA/billingual_project/apps/client-web/src/layouts/auth-layout.tsx) (added background glows, brand logo header, direct child Outlet container)
    - [src/components/ui/card.tsx](file:///c:/Users/sondo/my_projects/KMA/billingual_project/apps/client-web/src/components/ui/card.tsx) (made all card variants glassmorphic with Outfit heading typography globally)
    - [src/features/marketing/pages/landing-page.tsx](file:///c:/Users/sondo/my_projects/KMA/billingual_project/apps/client-web/src/features/marketing/pages/landing-page.tsx) (implemented text gradients, animated karaoke subtitles, high-contrast Bento grid features section)
    - [src/test/setup.ts](file:///c:/Users/sondo/my_projects/KMA/billingual_project/apps/client-web/src/test/setup.ts) (added vitest import to fix compile blocker)
  - Why: Redesigned the web client UI/UX to match brand logo assets and elevate the visual aesthetics to premium SaaS level.
  - Validation: `pnpm --filter client-web build` (succeeded), `pnpm --filter client-web lint` (succeeded), `pnpm --filter client-web test` (all 39 tests passed)
  - Follow-up: Implement pricing page content, wire real billing features

- 2026-06-09 — Landing page implementation
  - Status: Working
  - Changed: `src/features/marketing/pages/landing-page.tsx` (full landing page with Hero, Proof Strip, How It Works, Features, CTA sections), `src/i18n/en/marketing.json` and `src/i18n/vi/marketing.json` (added proofStrip and cta translation keys)
  - Why: Marketing landing page needed for user acquisition and product showcase
  - Validation: `npm run build` — clean, TypeScript compilation successful
  - Follow-up: None — landing page is complete

- 2026-06-09 — Auth pages implementation
  - Status: Working
  - Changed: `src/features/auth/pages/login-page.tsx` (email+password form, login via useAuth, redirect with returnTo/intent), `src/features/auth/pages/signup-page.tsx` (fullName+email+password form, registerRequest, navigate to /verify), `src/features/auth/pages/verify-page.tsx` (6-digit OTP, verifyRequest stores session, resend via resendRegistrationOtpRequest), `src/features/auth/pages/forgot-password-page.tsx` (email form, forgotPasswordRequest, navigate to /reset-password), `src/features/auth/pages/reset-password-page.tsx` (email+OTP+newPassword+confirmPassword, resetPasswordRequest, navigate to /login), `src/features/auth/auth-intent.ts` (storeCheckoutIntent/getCheckoutIntent using sessionStorage), `src/features/auth/auth-api.ts` (added resendRegistrationOtpRequest), `src/i18n/en/auth.json` and `src/i18n/vi/auth.json` (added error/success/resent keys)
  - Why: Core auth flow needed for user registration, login, and password recovery
  - Validation: `npx tsc --noEmit` — clean, `npx eslint src/features/auth/` — clean
  - Follow-up: None — pages are complete

- 2026-06-09 — Design system, ThemeProvider, Navbar, Footer
  - Status: Working
  - Changed: `src/index.css` (full CSS variable system for light/dark with teal+orange palette, `@theme inline` tokens), `src/components/theme-provider.tsx` (context-based theme with localStorage + system preference), `src/shared/components/navbar.tsx` (floating sticky nav, responsive hamburger, auth-aware, theme toggle, language switch), `src/shared/components/footer.tsx` (simple footer with links), `index.html` (Google Fonts preconnect + stylesheet), `App.tsx` (wired ThemeProvider + Navbar + Footer)
  - Why: Establishes the visual foundation and shared layout for all pages
  - Validation: `pnpm --filter client-web build` — clean, no warnings
  - Follow-up: Wire real auth hook, implement language switching with i18next, add actual page routes

## Known Issues

- Pre-existing: `@kapter/contracts` was missing from client-web dependencies (fixed by adding workspace dep)
- `useAuth()` in navbar is now wired to real AuthProvider

## Next Candidates

- [ ] Implement i18n language switching (EN/VI)
- [ ] Add pricing page content

## Contract Touchpoints

- API: `/auth/register`, `/auth/verify`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/resend-registration-otp`
- Queue: None
- Artifact: None
- Socket: None
- DB: None
- Auth: Full auth flow — login, signup, verify OTP, forgot/reset password, session storage via authStorage
- Mobile impact: None

## Validation Notes

- Fast check: `npx eslint src/features/auth/`
- Full check: `npx tsc --noEmit && npx eslint src/features/auth/`
- Last verified: 2026-06-09
