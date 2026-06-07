import type { BillingCycleType } from "./subscription.js";

export interface PlanVariant {
  id: string;
  planId: string;
  name: string;
  price: string;
  currency: string;
  billingCycleType: BillingCycleType;
  maxDurationPerFile: number;
  monthlyQuotaSeconds: number;
  aiCreditsPerMonth: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { subscriptions: number };
}

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  features: string[] | null;
  tierLevel: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  variants: PlanVariant[];
  _count: {
    variants: number;
  };
}

export interface CreatePlanPayload {
  id: string;
  code: string;
  name: string;
  description?: string;
  features?: string[];
  tierLevel?: number;
}

export interface UpdatePlanPayload {
  name?: string;
  description?: string;
  features?: string[];
  tierLevel?: number;
  isActive?: boolean;
}

export interface CreateVariantPayload {
  name: string;
  price: number;
  currency?: string;
  billingCycleType: BillingCycleType;
  maxDurationPerFile: number;
  monthlyQuotaSeconds: number;
  aiCreditsPerMonth: number;
}

export interface UpdateVariantPayload {
  name?: string;
  price?: number;
  currency?: string;
  maxDurationPerFile?: number;
  monthlyQuotaSeconds?: number;
  aiCreditsPerMonth?: number;
  isActive?: boolean;
}
