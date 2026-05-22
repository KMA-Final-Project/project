export function useSubscriptionQuota() {
  return {
    remainingMinutes: 120,
    totalMinutes: 300,
    isOverQuota: false,
    isLoading: false,
  };
}
