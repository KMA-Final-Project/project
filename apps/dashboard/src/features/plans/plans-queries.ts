import { queryOptions } from "@tanstack/react-query"

import { getPlans } from "@/features/plans/plans-api.ts"

export const plansKeys = {
  all: ["plans"] as const,
}

export const plansListQuery = () =>
  queryOptions({
    queryKey: plansKeys.all,
    queryFn: getPlans,
    staleTime: 5 * 60_000,
  })
