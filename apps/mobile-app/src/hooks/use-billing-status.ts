import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";

type BillingStatus = {
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
};

export const billingKeys = {
  status: ["billing-status"] as const,
};

export function useBillingStatus() {
  return useQuery({
    queryKey: billingKeys.status,
    queryFn: async () => {
      const res = await api.get<BillingStatus>("/billing/status");
      return res.data;
    },
    staleTime: 60_000,
  });
}
