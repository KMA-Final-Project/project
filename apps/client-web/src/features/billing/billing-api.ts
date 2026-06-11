import { privateApi, publicApi } from "@/shared/lib/api-client.ts"

import type {
  BillingCatalogItem,
  BillingStatusResponse,
  CreateCheckoutSessionResponse,
  CheckoutSessionStatusResponse,
  CreatePortalSessionResponse,
} from "@kapter/contracts"

export const getBillingCatalog = async (): Promise<BillingCatalogItem[]> => {
  const res = await publicApi.get<BillingCatalogItem[]>("/billing/catalog")
  return res.data
}

export const getBillingStatus = async (): Promise<BillingStatusResponse> => {
  const res = await privateApi.get<BillingStatusResponse>("/billing/status")
  return res.data
}

export const createCheckoutSession = async (
  variantId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<CreateCheckoutSessionResponse> => {
  const res = await privateApi.post<CreateCheckoutSessionResponse>(
    "/billing/checkout-session",
    { variantId, successUrl, cancelUrl },
  )
  return res.data
}

export const getCheckoutSessionStatus = async (
  sessionId: string,
): Promise<CheckoutSessionStatusResponse> => {
  const res = await privateApi.get<CheckoutSessionStatusResponse>(
    `/billing/checkout-sessions/${sessionId}`,
  )
  return res.data
}

export const createPortalSession = async (
  returnUrl: string,
): Promise<CreatePortalSessionResponse> => {
  const res = await privateApi.post<CreatePortalSessionResponse>(
    "/billing/customer-portal-session",
    { returnUrl },
  )
  return res.data
}
