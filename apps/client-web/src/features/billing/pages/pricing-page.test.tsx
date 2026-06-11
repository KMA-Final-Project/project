import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { PricingPage } from "./pricing-page"
import type { BillingCatalogItem } from "@kapter/contracts"

// Mock the API modules
vi.mock("../billing-api", () => ({
  getBillingCatalog: vi.fn(),
  getBillingStatus: vi.fn(),
  createCheckoutSession: vi.fn(),
}))

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    session: null,
  }),
}))

vi.mock("@/features/auth/auth-intent", () => ({
  authIntent: { set: vi.fn() },
}))

// Mock i18next to return the key as the translation
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}))

import { getBillingCatalog } from "../billing-api"

const mockCatalog: BillingCatalogItem[] = [
  {
    planCode: "basic",
    planName: "Basic",
    variantId: "basic-monthly",
    variantName: "Monthly",
    price: "49000",
    currency: "VND",
    billingCycleType: "MONTHLY",
    monthlyQuotaSeconds: 18000,
    maxDurationPerFile: 900,
    aiCreditsPerMonth: 50,
  },
  {
    planCode: "basic",
    planName: "Basic",
    variantId: "basic-yearly",
    variantName: "Yearly (Save 17%)",
    price: "490000",
    currency: "VND",
    billingCycleType: "YEARLY",
    monthlyQuotaSeconds: 18000,
    maxDurationPerFile: 900,
    aiCreditsPerMonth: 60,
  },
  {
    planCode: "pro",
    planName: "Pro",
    variantId: "pro-monthly",
    variantName: "Monthly",
    price: "99000",
    currency: "VND",
    billingCycleType: "MONTHLY",
    monthlyQuotaSeconds: 72000,
    maxDurationPerFile: 3600,
    aiCreditsPerMonth: 100,
  },
]

function renderPricingPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PricingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("PricingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders plan cards from catalog", async () => {
    vi.mocked(getBillingCatalog).mockResolvedValue(mockCatalog)
    renderPricingPage()

    await waitFor(() => {
      expect(screen.getByText("Basic")).toBeInTheDocument()
      expect(screen.getByText("Pro")).toBeInTheDocument()
    })
  })

  it("shows billing cycle tabs", async () => {
    vi.mocked(getBillingCatalog).mockResolvedValue(mockCatalog)
    renderPricingPage()

    await waitFor(() => {
      // Should render tab triggers for billing cycles
      const tabs = screen.getAllByRole("tab")
      expect(tabs.length).toBeGreaterThan(0)
    })
  })

  it("shows plan prices", async () => {
    vi.mocked(getBillingCatalog).mockResolvedValue(mockCatalog)
    renderPricingPage()

    await waitFor(() => {
      // Prices should be formatted
      expect(screen.getByText(/49[,.]?000/)).toBeInTheDocument()
      expect(screen.getByText(/99[,.]?000/)).toBeInTheDocument()
    })
  })

  it("shows CTA buttons for each plan", async () => {
    vi.mocked(getBillingCatalog).mockResolvedValue(mockCatalog)
    renderPricingPage()

    await waitFor(() => {
      // Each plan card should have a CTA button
      const buttons = screen.getAllByRole("button")
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  it("renders empty grid when no catalog items", async () => {
    vi.mocked(getBillingCatalog).mockResolvedValue([])
    renderPricingPage()

    await waitFor(() => {
      // Should render without crashing
      expect(screen.getByText("pricing.title")).toBeInTheDocument()
    })
  })
})
