import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  loginRequest,
  registerRequest,
  verifyRequest,
  forgotPasswordRequest,
  resetPasswordRequest,
} from "./auth-api"
import { publicApi } from "@/shared/lib/api-client"

vi.mock("@/shared/lib/api-client", () => ({
  publicApi: { post: vi.fn() },
}))

describe("auth-api", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("loginRequest", () => {
    it("calls POST /auth/login with credentials", async () => {
      const mockSession = {
        user: { id: "u1", email: "test@example.com", fullName: "Test", emailVerified: true, role: "USER" },
        tokens: { accessToken: "at", refreshToken: "rt" },
      }
      vi.mocked(publicApi.post).mockResolvedValue({ data: mockSession })

      const result = await loginRequest({ email: "test@example.com", password: "pass123" })

      expect(publicApi.post).toHaveBeenCalledWith("/auth/login", {
        email: "test@example.com",
        password: "pass123",
      })
      expect(result).toEqual(mockSession)
    })
  })

  describe("registerRequest", () => {
    it("calls POST /auth/register with payload", async () => {
      vi.mocked(publicApi.post).mockResolvedValue({ data: { message: "success" } })

      const result = await registerRequest({
        email: "new@example.com",
        password: "Pass123!",
        fullName: "New User",
      })

      expect(publicApi.post).toHaveBeenCalledWith("/auth/register", {
        email: "new@example.com",
        password: "Pass123!",
        fullName: "New User",
      })
      expect(result).toEqual({ message: "success" })
    })
  })

  describe("verifyRequest", () => {
    it("calls POST /auth/verify with OTP", async () => {
      const mockSession = {
        user: { id: "u1", email: "test@example.com", fullName: "Test", emailVerified: true, role: "USER" },
        tokens: { accessToken: "at", refreshToken: "rt" },
      }
      vi.mocked(publicApi.post).mockResolvedValue({ data: mockSession })

      const result = await verifyRequest({ email: "test@example.com", otp: "123456" })

      expect(publicApi.post).toHaveBeenCalledWith("/auth/verify", {
        email: "test@example.com",
        otp: "123456",
      })
      expect(result).toEqual(mockSession)
    })
  })

  describe("forgotPasswordRequest", () => {
    it("calls POST /auth/forgot-password with email", async () => {
      vi.mocked(publicApi.post).mockResolvedValue({
        data: { message: "If an account exists..." },
      })

      const result = await forgotPasswordRequest("test@example.com")

      expect(publicApi.post).toHaveBeenCalledWith("/auth/forgot-password", {
        email: "test@example.com",
      })
      expect(result.message).toContain("account exists")
    })
  })

  describe("resetPasswordRequest", () => {
    it("calls POST /auth/reset-password with payload", async () => {
      vi.mocked(publicApi.post).mockResolvedValue({
        data: { message: "Password reset successfully" },
      })

      const result = await resetPasswordRequest({
        email: "test@example.com",
        otp: "123456",
        newPassword: "NewPass123!",
      })

      expect(publicApi.post).toHaveBeenCalledWith("/auth/reset-password", {
        email: "test@example.com",
        otp: "123456",
        newPassword: "NewPass123!",
      })
      expect(result.message).toContain("reset")
    })
  })
})
