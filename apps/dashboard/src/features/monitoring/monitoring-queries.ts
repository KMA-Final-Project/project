import { queryOptions } from "@tanstack/react-query"

import {
  getMonitoringQueues,
  getMonitoringFailures,
  getTranslationFinalizationSummary,
  getTranslationFinalizationMedia,
} from "@/features/monitoring/monitoring-api.ts"
import type {
  AdminMonitoringFailuresQuery,
  AdminTranslationFinalizationSummaryQuery,
  AdminTranslationFinalizationMediaQuery,
} from "@/features/monitoring/types.ts"

export const monitoringKeys = {
  all: ["monitoring"] as const,
  queues: () => [...monitoringKeys.all, "queues"] as const,
  failures: (params: AdminMonitoringFailuresQuery) =>
    [...monitoringKeys.all, "failures", params] as const,
  translationFinalizationSummary: (
    params: AdminTranslationFinalizationSummaryQuery,
  ) => [...monitoringKeys.all, "translation-finalization", "summary", params] as const,
  translationFinalizationMedia: (params: AdminTranslationFinalizationMediaQuery) =>
    [...monitoringKeys.all, "translation-finalization", "media", params] as const,
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

export const monitoringTranslationFinalizationSummaryQuery = (
  params: AdminTranslationFinalizationSummaryQuery,
) =>
  queryOptions({
    queryKey: monitoringKeys.translationFinalizationSummary(params),
    queryFn: () => getTranslationFinalizationSummary(params),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

export const monitoringTranslationFinalizationMediaQuery = (
  params: AdminTranslationFinalizationMediaQuery,
) =>
  queryOptions({
    queryKey: monitoringKeys.translationFinalizationMedia(params),
    queryFn: () => getTranslationFinalizationMedia(params),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
