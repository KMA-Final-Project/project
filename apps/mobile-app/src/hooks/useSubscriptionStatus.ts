import { useQuery } from "@tanstack/react-query";
import { subscriptionService } from "@/services/subscription.service";
import type { SubscriptionStatusResponse } from "@/types/subscription";

export const subscriptionKeys = {
  status: ["subscription-status"] as const,
};

export function useSubscriptionStatus() {
  return useQuery<SubscriptionStatusResponse>({
    queryKey: subscriptionKeys.status,
    queryFn: () => subscriptionService.getStatus(),
    staleTime: 30_000,
  });
}
