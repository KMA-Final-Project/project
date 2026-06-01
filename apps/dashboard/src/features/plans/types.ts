export type BillingCycleType = "MONTHLY" | "SIX_MONTHS" | "YEARLY" | "LIFETIME"

export type PlanVariant = {
  id: string
  planId: string
  name: string
  price: string
  currency: string
  billingCycleType: BillingCycleType
  maxDurationPerFile: number
  monthlyQuotaSeconds: number
  aiCreditsPerMonth: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  /** Present when fetched via GET /admin/plans/:id */
  _count?: { subscriptions: number }
}

export type SubscriptionPlan = {
  id: string
  code: string
  name: string
  description: string | null
  features: string[] | null
  tierLevel: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  variants: PlanVariant[]
  _count: {
    variants: number
  }
}

// ===== Mutation Payloads =====

export type CreatePlanPayload = {
  id: string
  code: string
  name: string
  description?: string
  features?: string[]
  tierLevel?: number
}

export type UpdatePlanPayload = {
  name?: string
  description?: string
  features?: string[]
  tierLevel?: number
  isActive?: boolean
}

export type CreateVariantPayload = {
  name: string
  price: number
  currency?: string
  billingCycleType: BillingCycleType
  maxDurationPerFile: number
  monthlyQuotaSeconds: number
  aiCreditsPerMonth: number
}

export type UpdateVariantPayload = {
  name?: string
  price?: number
  currency?: string
  maxDurationPerFile?: number
  monthlyQuotaSeconds?: number
  aiCreditsPerMonth?: number
  isActive?: boolean
}

