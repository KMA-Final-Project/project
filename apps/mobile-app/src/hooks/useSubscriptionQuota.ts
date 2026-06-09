import { useSubscriptionStatus } from "./useSubscriptionStatus";

export function useSubscriptionQuota() {
  const { data, isLoading } = useSubscriptionStatus();
  const remainingSeconds = data?.quota.remainingSeconds;
  const totalSeconds = data?.quota.totalSeconds;

  return {
    remainingMinutes:
      remainingSeconds == null ? null : Math.max(0, Math.floor(remainingSeconds / 60)),
    totalMinutes:
      totalSeconds == null ? null : Math.max(0, Math.floor(totalSeconds / 60)),
    isOverQuota: data?.quota.uploadBlockerCode === "quotaExceeded",
    isLoading,
  };
}
