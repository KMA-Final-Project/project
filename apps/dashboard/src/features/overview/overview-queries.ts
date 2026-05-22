import { queryOptions } from "@tanstack/react-query"

import { getOverview } from "@/features/overview/overview-api.ts"

export const overviewKeys = {
  all: ["overview"] as const,
}

export const overviewQuery = () =>
  queryOptions({
    queryKey: overviewKeys.all,
    queryFn: getOverview,
    staleTime: 15_000,
    refetchInterval: 15_000,
  })
