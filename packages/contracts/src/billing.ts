export interface BillingCatalogItem {
  planCode: string;
  planName: string;
  variantId: string;
  variantName: string;
  price: string;
  currency: string;
  billingCycleType: string;
  monthlyQuotaSeconds: number;
  maxDurationPerFile: number;
  aiCreditsPerMonth: number;
}

export interface BillingStatusResponse {
  hasStripeCustomer: boolean;
  hasActivePaidSubscription: boolean;
  stripeCustomerId: string | null;
  currentSubscription: {
    variantId: string;
    planName: string;
    status: string;
    stripeStatus: string | null;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  } | null;
}

export interface CreateCheckoutSessionRequest {
  variantId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutSessionResponse {
  checkoutUrl: string;
  sessionId: string;
}

export interface CheckoutSessionStatusResponse {
  sessionId: string;
  status: string;
  variantId: string;
  completedAt: string | null;
}

export interface CreatePortalSessionRequest {
  returnUrl: string;
}

export interface CreatePortalSessionResponse {
  url: string;
}
