# Mobile-Web Billing Handoff Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Enable mobile users to open web billing in an in-app browser with automatic auth via one-time handoff token.

**Tech Stack:** NestJS, Redis, React 19, React Router 7, Expo WebBrowser, Zustand

---

## Task 1: Contract types
- [ ] Add to packages/contracts/src/auth.ts: MobileWebHandoffRequest, MobileWebHandoffResponse, MobileWebHandoffConsumeRequest
- [ ] Build contracts: pnpm --filter @kapter/contracts build

## Task 2: Backend handoff endpoints
- [ ] Add POST /auth/mobile-web-handoff (authenticated): create UUID token, store in Redis with TTL=120s, return handoffUrl
- [ ] Add POST /auth/mobile-web-handoff/consume (public): look up token in Redis, delete on success, return AuthResponse
- [ ] Add CLIENT_WEB_BASE_URL config
- [ ] Add unit tests for both endpoints
- [ ] Build + lint + test

## Task 3: Client-web /handoff route
- [ ] Create /handoff page: reads token/target/fromMobile, calls consume endpoint, stores session, redirects
- [ ] On failure: redirect to /login?fromMobile=1&returnTo=/pricing
- [ ] Add route to router.tsx
- [ ] Build

## Task 4: Return to app button
- [ ] Create ReturnToApp component: reads fromMobile + VITE_MOBILE_APP_RETURN_URL, appends context param
- [ ] Add to: /pricing, /account/subscription, /billing/success, /billing/cancel (when fromMobile=1)
- [ ] Preserve fromMobile=1 through checkout URLs and portal return URL
- [ ] Build

## Task 5: Mobile billing handoff service
- [ ] Create billing-handoff.service.ts: calls POST /auth/mobile-web-handoff, opens WebBrowser.openAuthSessionAsync
- [ ] Create useBillingStatus hook: calls GET /billing/status
- [ ] Update subscription screen: replace Coming Soon modal with real handoff flow
- [ ] Add return handling: read refreshBilling/context, invalidate queries, show toast
- [ ] Build

## Task 6: Documentation + validation
- [ ] Update CONTRACTS.md with handoff endpoints
- [ ] Update CHECKPOINT.md files
- [ ] pnpm --filter backend-api build && lint && test
- [ ] pnpm --filter client-web build && lint && typecheck
