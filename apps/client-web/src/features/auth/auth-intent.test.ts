import { describe, it, expect, beforeEach } from "vitest"
import { authIntent, getCheckoutIntent } from "./auth-intent"

describe("authIntent", () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it("returns null when no intent stored", () => {
    expect(authIntent.get()).toBeNull()
  })

  it("stores and retrieves intent", () => {
    authIntent.set({ type: "checkout", variantId: "v1" })
    expect(authIntent.get()).toEqual({ type: "checkout", variantId: "v1" })
  })

  it("clears intent", () => {
    authIntent.set({ type: "checkout", variantId: "v1" })
    authIntent.clear()
    expect(authIntent.get()).toBeNull()
  })

  it("handles corrupted JSON gracefully", () => {
    sessionStorage.setItem("kapter.auth.intent", "not-json")
    expect(authIntent.get()).toBeNull()
  })
})

describe("getCheckoutIntent", () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it("returns null when no intent", () => {
    expect(getCheckoutIntent()).toBeNull()
  })

  it("returns returnTo with variantId and clears intent", () => {
    authIntent.set({ type: "checkout", variantId: "v1" })
    const result = getCheckoutIntent()
    expect(result).toEqual({ returnTo: "/pricing?variant=v1", variantId: "v1" })
    // Should be cleared after reading
    expect(authIntent.get()).toBeNull()
  })
})
