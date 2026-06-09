import { queryOptions } from "@tanstack/react-query"

import { getPlans, getPlanById } from "@/features/plans/plans-api.ts"

export const plansKeys = {
  all: ["plans"] as const,
  detail: (id: string) => [...plansKeys.all, id] as const,
}

export const plansListQuery = () =>
  queryOptions({
    queryKey: plansKeys.all,
    queryFn: getPlans,
    staleTime: 5 * 60_000,
  })

export const planDetailQuery = (id: string) =>
  queryOptions({
    queryKey: plansKeys.detail(id),
    queryFn: () => getPlanById(id),
    staleTime: 60_000,
    enabled: !!id,
  })
