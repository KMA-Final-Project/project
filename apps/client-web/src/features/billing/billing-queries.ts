import { queryOptions } from "@tanstack/react-query"
import {
  getBillingCatalog,
  getBillingStatus,
  getCheckoutSessionStatus,
} from "./billing-api.ts"

export const billingKeys = {
  all: ["billing"] as const,
  catalog: () => [...billingKeys.all, "catalog"] as const,
  status: () => [...billingKeys.all, "status"] as const,
  session: (id: string) => [...billingKeys.all, "session", id] as const,
}

export const billingCatalogQuery = () =>
  queryOptions({
    queryKey: billingKeys.catalog(),
    queryFn: getBillingCatalog,
    staleTime: 5 * 60_000,
  })

export const billingStatusQuery = () =>
  queryOptions({
    queryKey: billingKeys.status(),
    queryFn: getBillingStatus,
    staleTime: 60_000,
  })

export const checkoutSessionQuery = (sessionId: string) =>
  queryOptions({
    queryKey: billingKeys.session(sessionId),
    queryFn: () => getCheckoutSessionStatus(sessionId),
    enabled: !!sessionId,
  })
