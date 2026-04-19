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
  isActive: boolean
  createdAt: string
  updatedAt: string
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
