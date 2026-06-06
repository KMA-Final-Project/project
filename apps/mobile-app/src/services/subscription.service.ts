import { ENDPOINTS } from "@/constants/endpoint";
import { api } from "@/services/api";
import type { SubscriptionStatusResponse } from "@/types/subscription";

export const subscriptionService = {
  async getStatus(): Promise<SubscriptionStatusResponse> {
    const res = await api.get<SubscriptionStatusResponse>(
      ENDPOINTS.USER_SUBSCRIPTION_STATUS,
    );
    return res.data;
  },
};
