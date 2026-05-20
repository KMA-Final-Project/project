// ===== Users Types =====

export type UserRole = "USER" | "ADMIN"

export type SubscriptionStatus = "ACTIVE" | "EXPIRED" | "CANCELLED"

export type BillingCycleType =
  | "MONTHLY"
  | "SIX_MONTHS"
  | "YEARLY"
  | "LIFETIME"

export type AdminUserListItem = {
  id: string
  email: string
  fullName: string
  role: UserRole
  emailVerified: boolean
  createdAt: string
  currentPlanName: string | null
  currentPlanCode: string | null
  subscriptionStatus: SubscriptionStatus | null
  quotaUsageCurrentMonthSeconds: number
}

export type AdminUserListResponse = {
  data: AdminUserListItem[]
  total: number
  page: number
  limit: number
}

export type AdminUserSubscriptionSnapshot = {
  id: string
  status: SubscriptionStatus
  startDate: string
  endDate: string
  priceSnapshot: string
  monthlyQuotaSecondsSnapshot: number
  maxDurationPerFileSnapshot: number
  variantName: string | null
  planName: string | null
  planCode: string | null
  billingCycleType: BillingCycleType | null
}

export type AdminUserUsageHistoryItem = {
  id: string
  cycleStartDate: string
  cycleEndDate: string
  totalSecondsUsed: number
  quotaLimitAtThatTime: number
}

export type AdminUserDetail = {
  id: string
  email: string
  fullName: string
  role: UserRole
  emailVerified: boolean
  createdAt: string
  updatedAt: string
  quotaUsageCurrentMonthSeconds: number
  currentSubscription: AdminUserSubscriptionSnapshot | null
  recentUsageHistory: AdminUserUsageHistoryItem[]
  totalMediaItems: number
}

export type UsersQueryParams = {
  page?: number
  limit?: number
}
