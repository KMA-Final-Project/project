import type { BillingCycleType } from "./subscription.js";
import type { UserRole } from "./auth.js";

export type AdminSubscriptionStatus = "ACTIVE" | "EXPIRED" | "CANCELLED";

export interface AdminUsersQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  planId?: string;
  variantId?: string;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  emailVerified: boolean;
  createdAt: string;
  currentPlanName: string | null;
  currentPlanCode: string | null;
  subscriptionStatus: AdminSubscriptionStatus | null;
  quotaUsageCurrentMonthSeconds: number;
}

export interface AdminUserListResponse {
  data: AdminUserListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminUserSubscriptionSnapshot {
  id: string;
  status: AdminSubscriptionStatus;
  startDate: string;
  endDate: string;
  priceSnapshot: string;
  monthlyQuotaSecondsSnapshot: number;
  maxDurationPerFileSnapshot: number;
  variantName: string | null;
  planName: string | null;
  planCode: string | null;
  billingCycleType: BillingCycleType | null;
}

export interface AdminUserUsageHistoryItem {
  id: string;
  cycleStartDate: string;
  cycleEndDate: string;
  totalSecondsUsed: number;
  quotaLimitAtThatTime: number;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  quotaUsageCurrentMonthSeconds: number;
  currentSubscription: AdminUserSubscriptionSnapshot | null;
  recentUsageHistory: AdminUserUsageHistoryItem[];
  totalMediaItems: number;
}

export interface UpdateAdminUserRolePayload {
  role: UserRole;
}

export interface AdminUserRoleUpdateResult {
  id: string;
  role: UserRole;
  updatedAt: string;
}
