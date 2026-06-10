import { privateApi } from "@/shared/lib/api-client.ts"
import type { SubscriptionStatusResponse } from "@kapter/contracts"

export const getSubscriptionStatus =
  async (): Promise<SubscriptionStatusResponse> => {
    const res = await privateApi.get<SubscriptionStatusResponse>(
      "/user/subscription-status",
    )
    return res.data
  }
