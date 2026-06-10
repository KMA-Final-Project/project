import { describe, it, expect, vi, beforeEach } from "vitest"
import { getSubscriptionStatus } from "./account-api"
import { privateApi } from "@/shared/lib/api-client"

vi.mock("@/shared/lib/api-client", () => ({
  privateApi: { get: vi.fn() },
}))

describe("account-api", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getSubscriptionStatus", () => {
    it("calls privateApi.get with correct path", async () => {
      const mockData = {
        currentPlan: {
          planCode: "pro",
          planName: "Pro",
          variantId: "v1",
          variantName: "Monthly",
          status: "ACTIVE",
          priceSnapshot: "99000",
          currency: "VND",
          billingCycleType: "MONTHLY",
        },
        quota: {
          usedSeconds: 3600,
          totalSeconds: 72000,
          remainingSeconds: 68400,
          maxDurationPerFileSeconds: 3600,
          windowStartAt: "2026-06-01T00:00:00Z",
          windowEndAt: "2026-07-01T00:00:00Z",
          uploadBlockerCode: "none",
        },
        aiCredits: {
          remaining: 80,
          includedPerCycle: 100,
        },
        availablePlans: [],
      }
      vi.mocked(privateApi.get).mockResolvedValue({ data: mockData })

      const result = await getSubscriptionStatus()

      expect(privateApi.get).toHaveBeenCalledWith("/user/subscription-status")
      expect(result.currentPlan?.planCode).toBe("pro")
      expect(result.quota.usedSeconds).toBe(3600)
      expect(result.aiCredits.remaining).toBe(80)
    })
  })
})
