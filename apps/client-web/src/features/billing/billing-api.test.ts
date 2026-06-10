import { describe, it, expect, vi, beforeEach } from "vitest"
import { getBillingCatalog, getBillingStatus, createCheckoutSession } from "./billing-api"
import { publicApi, privateApi } from "@/shared/lib/api-client"

// Mock the API clients
vi.mock("@/shared/lib/api-client", () => ({
  publicApi: { get: vi.fn() },
  privateApi: { get: vi.fn(), post: vi.fn() },
}))

describe("billing-api", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getBillingCatalog", () => {
    it("calls publicApi.get with correct path", async () => {
      const mockData = [
        {
          planCode: "pro",
          planName: "Pro",
          variantId: "v1",
          variantName: "Monthly",
          price: "99000",
          currency: "VND",
          billingCycleType: "MONTHLY",
          monthlyQuotaSeconds: 72000,
          maxDurationPerFile: 3600,
          aiCreditsPerMonth: 100,
        },
      ]
      vi.mocked(publicApi.get).mockResolvedValue({ data: mockData })

      const result = await getBillingCatalog()

      expect(publicApi.get).toHaveBeenCalledWith("/billing/catalog")
      expect(result).toEqual(mockData)
    })
  })

  describe("getBillingStatus", () => {
    it("calls privateApi.get with correct path", async () => {
      const mockData = {
        hasStripeCustomer: false,
        hasActivePaidSubscription: false,
        stripeCustomerId: null,
        currentSubscription: null,
      }
      vi.mocked(privateApi.get).mockResolvedValue({ data: mockData })

      const result = await getBillingStatus()

      expect(privateApi.get).toHaveBeenCalledWith("/billing/status")
      expect(result).toEqual(mockData)
    })
  })

  describe("createCheckoutSession", () => {
    it("calls privateApi.post with correct params", async () => {
      const mockData = {
        checkoutUrl: "https://checkout.stripe.com/test",
        sessionId: "sess-1",
      }
      vi.mocked(privateApi.post).mockResolvedValue({ data: mockData })

      const result = await createCheckoutSession(
        "v1",
        "http://localhost:5173/success",
        "http://localhost:5173/cancel",
      )

      expect(privateApi.post).toHaveBeenCalledWith("/billing/checkout-session", {
        variantId: "v1",
        successUrl: "http://localhost:5173/success",
        cancelUrl: "http://localhost:5173/cancel",
      })
      expect(result).toEqual(mockData)
    })
  })
})
