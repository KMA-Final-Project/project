export type UploadBlockerCode =
  | "none"
  | "subscriptionInactive"
  | "quotaExceeded";

export type SubscriptionPlanStatus = "ACTIVE" | "INACTIVE" | "EXPIRED";

export type BillingCycleType =
  | "MONTHLY"
  | "SIX_MONTHS"
  | "YEARLY"
  | "LIFETIME";

export interface CurrentSubscriptionPlan {
  planCode: string;
  planName: string;
  variantId: string;
  variantName: string;
  status: SubscriptionPlanStatus;
  priceSnapshot: string;
  currency: string;
  billingCycleType: BillingCycleType;
}

export interface SubscriptionQuota {
  usedSeconds: number;
  totalSeconds: number | null;
  remainingSeconds: number | null;
  maxDurationPerFileSeconds: number | null;
  windowStartAt: string;
  windowEndAt: string;
  uploadBlockerCode: UploadBlockerCode;
}

export interface SubscriptionAiCredits {
  remaining: number;
  includedPerCycle: number;
}

export interface AvailablePlan {
  planCode: string;
  planName: string;
  description: string | null;
  features: string[];
  tierLevel: number | null;
  variantId: string;
  variantName: string;
  price: string;
  currency: string;
  billingCycleType: BillingCycleType;
  monthlyQuotaSeconds: number | null;
  maxDurationPerFileSeconds: number | null;
  aiCreditsPerMonth: number;
  isCurrent: boolean;
}

export interface SubscriptionStatusResponse {
  currentPlan: CurrentSubscriptionPlan | null;
  quota: SubscriptionQuota;
  aiCredits: SubscriptionAiCredits;
  availablePlans: AvailablePlan[];
}
