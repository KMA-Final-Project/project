import { describe, it, expect, beforeEach } from "vitest"
import { authStorage } from "./auth-storage"
import type { AuthResponse } from "@kapter/contracts"

const mockSession: AuthResponse = {
  user: {
    id: "user-1",
    email: "test@example.com",
    fullName: "Test User",
    emailVerified: true,
    role: "USER",
  },
  tokens: {
    accessToken: "access-123",
    refreshToken: "refresh-456",
  },
}

describe("authStorage", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("returns null when no session stored", () => {
    expect(authStorage.get()).toBeNull()
  })

  it("stores and retrieves session", () => {
    authStorage.set(mockSession)
    expect(authStorage.get()).toEqual(mockSession)
  })

  it("clears session", () => {
    authStorage.set(mockSession)
    authStorage.clear()
    expect(authStorage.get()).toBeNull()
  })

  it("handles corrupted JSON gracefully", () => {
    localStorage.setItem("kapter.session", "not-json")
    expect(authStorage.get()).toBeNull()
    // Should also clean up the corrupted value
    expect(localStorage.getItem("kapter.session")).toBeNull()
  })

  it("updateTokens merges new tokens into existing session", () => {
    authStorage.set(mockSession)
    authStorage.updateTokens({
      accessToken: "new-access",
      refreshToken: "new-refresh",
    })
    const updated = authStorage.get()
    expect(updated?.tokens.accessToken).toBe("new-access")
    expect(updated?.tokens.refreshToken).toBe("new-refresh")
    expect(updated?.user.id).toBe("user-1")
  })

  it("updateTokens does nothing when no session exists", () => {
    authStorage.updateTokens({
      accessToken: "new-access",
      refreshToken: "new-refresh",
    })
    expect(authStorage.get()).toBeNull()
  })

  it("subscribe receives events", () => {
    const events: string[] = []
    const unsubscribe = authStorage.subscribe((detail) => {
      events.push(detail.type)
    })

    authStorage.set(mockSession)
    authStorage.clear()

    expect(events).toEqual(["update", "clear"])
    unsubscribe()
  })
})
