import { queryOptions } from "@tanstack/react-query"
import { getSubscriptionStatus } from "./account-api.ts"
import { getBillingStatus } from "@/features/billing/billing-api.ts"

export const accountKeys = {
  all: ["account"] as const,
  subscriptionStatus: () => [...accountKeys.all, "subscription-status"] as const,
  billingStatus: () => [...accountKeys.all, "billing-status"] as const,
}

export const subscriptionStatusQuery = () =>
  queryOptions({
    queryKey: accountKeys.subscriptionStatus(),
    queryFn: getSubscriptionStatus,
    staleTime: 60_000,
  })

export const billingStatusQuery = () =>
  queryOptions({
    queryKey: accountKeys.billingStatus(),
    queryFn: getBillingStatus,
    staleTime: 60_000,
  })
