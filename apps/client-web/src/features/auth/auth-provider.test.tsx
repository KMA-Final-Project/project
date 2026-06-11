import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { AuthProvider, useAuth } from "./auth-provider"
import { authStorage } from "./auth-storage"
import type { AuthResponse } from "@kapter/contracts"

// Mock the login API
vi.mock("./auth-api", () => ({
  loginRequest: vi.fn(),
}))

import { loginRequest } from "./auth-api"

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

// Test component that exposes auth context
function TestConsumer() {
  const auth = useAuth()
  return (
    <div>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="email">{auth.session?.user.email ?? "none"}</span>
      <button onClick={() => auth.login({ email: "test@example.com", password: "pass" })}>
        Login
      </button>
      <button onClick={() => auth.logout()}>Logout</button>
    </div>
  )
}

describe("AuthProvider", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it("starts unauthenticated when no stored session", () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    expect(screen.getByTestId("authenticated")).toHaveTextContent("false")
    expect(screen.getByTestId("email")).toHaveTextContent("none")
  })

  it("restores session from localStorage", () => {
    authStorage.set(mockSession)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    expect(screen.getByTestId("authenticated")).toHaveTextContent("true")
    expect(screen.getByTestId("email")).toHaveTextContent("test@example.com")
  })

  it("login stores session and updates state", async () => {
    vi.mocked(loginRequest).mockResolvedValue(mockSession)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    expect(screen.getByTestId("authenticated")).toHaveTextContent("false")

    await act(async () => {
      screen.getByText("Login").click()
    })

    expect(screen.getByTestId("authenticated")).toHaveTextContent("true")
    expect(screen.getByTestId("email")).toHaveTextContent("test@example.com")
    expect(authStorage.get()?.tokens.accessToken).toBe("access-123")
  })

  it("logout clears session", async () => {
    authStorage.set(mockSession)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    expect(screen.getByTestId("authenticated")).toHaveTextContent("true")

    await act(async () => {
      screen.getByText("Logout").click()
    })

    expect(screen.getByTestId("authenticated")).toHaveTextContent("false")
    expect(authStorage.get()).toBeNull()
  })

  it("syncs session when authStorage changes externally", () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    expect(screen.getByTestId("authenticated")).toHaveTextContent("false")

    act(() => {
      authStorage.set(mockSession)
    })

    expect(screen.getByTestId("authenticated")).toHaveTextContent("true")
    expect(screen.getByTestId("email")).toHaveTextContent("test@example.com")
  })
})
