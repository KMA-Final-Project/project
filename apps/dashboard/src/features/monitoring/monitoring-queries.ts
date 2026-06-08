import { queryOptions } from "@tanstack/react-query"

import {
  getMonitoringQueues,
  getMonitoringFailures,
} from "@/features/monitoring/monitoring-api.ts"
import type { AdminMonitoringFailuresQuery } from "@/features/monitoring/types.ts"

export const monitoringKeys = {
  all: ["monitoring"] as const,
  queues: () => [...monitoringKeys.all, "queues"] as const,
  failures: (params: AdminMonitoringFailuresQuery) =>
    [...monitoringKeys.all, "failures", params] as const,
}

export const monitoringQueuesQuery = () =>
  queryOptions({
    queryKey: monitoringKeys.queues(),
    queryFn: getMonitoringQueues,
    staleTime: 15_000,
    refetchInterval: 15_000,
  })

export const monitoringFailuresQuery = (params: AdminMonitoringFailuresQuery) =>
  queryOptions({
    queryKey: monitoringKeys.failures(params),
    queryFn: () => getMonitoringFailures(params),
    staleTime: 15_000,
    refetchInterval: 15_000,
  })
