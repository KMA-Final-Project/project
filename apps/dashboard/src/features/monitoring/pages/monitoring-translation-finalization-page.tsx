import { useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "react-router"
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiLoader4Line,
  RiRefreshLine,
} from "@remixicon/react"

import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import {
  monitoringTranslationFinalizationMediaQuery,
  monitoringTranslationFinalizationSummaryQuery,
} from "@/features/monitoring/monitoring-queries.ts"
import type {
  AdminTranslationFinalizationHealthFilter,
  AdminTranslationFinalizationMediaListItem,
} from "@/features/monitoring/types.ts"

const PAGE_SIZE = 20

export const MonitoringTranslationFinalizationPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()

  const period = searchParams.get("period") === "30d" ? "30d" : "7d"
  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const sourceLanguage = searchParams.get("sourceLanguage") ?? ""
  const targetLanguage = searchParams.get("targetLanguage") ?? ""
  const provider = searchParams.get("provider") ?? ""
  const profile = searchParams.get("profile") ?? ""
  const health =
    (searchParams.get("health") as AdminTranslationFinalizationHealthFilter | null) ??
    "all"

  const updateParam = useCallback(
    (key: string, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (value) {
          next.set(key, value)
        } else {
          next.delete(key)
        }
        next.set("page", "1")
        return next
      })
    },
    [setSearchParams],
  )

  const summaryQuery = useQuery(
    monitoringTranslationFinalizationSummaryQuery({
      period,
      sourceLanguage: sourceLanguage || undefined,
      targetLanguage: targetLanguage || undefined,
      provider: provider || undefined,
      profile: profile || undefined,
    }),
  )

  const mediaQuery = useQuery(
    monitoringTranslationFinalizationMediaQuery({
      period,
      page,
      limit: PAGE_SIZE,
      health,
      sourceLanguage: sourceLanguage || undefined,
      targetLanguage: targetLanguage || undefined,
      provider: provider || undefined,
      profile: profile || undefined,
    }),
  )

  if (summaryQuery.isPending || mediaQuery.isPending) {
    return (
      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardContent className="flex min-h-72 items-center justify-center gap-3 text-muted-foreground">
          <RiLoader4Line className="size-5 animate-spin" />
          Loading translation finalization telemetry...
        </CardContent>
      </Card>
    )
  }

  if (summaryQuery.isError || mediaQuery.isError) {
    return (
      <Card className="panel-glow border border-destructive/30 bg-destructive/10">
        <CardHeader>
          <CardTitle>Failed to load translation finalization telemetry</CardTitle>
          <CardDescription>
            One of the monitoring endpoints did not respond successfully.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => {
              void summaryQuery.refetch()
              void mediaQuery.refetch()
            }}
          >
            <RiRefreshLine data-icon="inline-start" className="size-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const summary = summaryQuery.data
  const media = mediaQuery.data
  const providerOptions = summary.breakdowns.byProvider.map((item) => item.provider)
  const profileOptions = summary.breakdowns.byProfile.map((item) => item.profile)
  const totalPages = Math.max(1, Math.ceil(media.total / PAGE_SIZE))

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="signal-text">translation latency + quality</div>
          <h2 className="mt-3 font-heading text-3xl text-card-foreground">
            Translation finalization
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Operator visibility into LLM usage, finalization cost, coverage,
            fallback behavior, and route/profile spend.
          </p>
        </div>
        <div className="flex gap-2">
          {(["7d", "30d"] as const).map((option) => (
            <Button
              key={option}
              variant={period === option ? "default" : "outline"}
              size="sm"
              onClick={() => updateParam("period", option)}
            >
              {option}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void summaryQuery.refetch()
              void mediaQuery.refetch()
            }}
          >
            <RiRefreshLine className="size-4" />
          </Button>
        </div>
      </section>

      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <Input
            className="w-28"
            placeholder="Source"
            value={sourceLanguage}
            onChange={(event) => updateParam("sourceLanguage", event.target.value)}
          />
          <Input
            className="w-28"
            placeholder="Target"
            value={targetLanguage}
            onChange={(event) => updateParam("targetLanguage", event.target.value)}
          />
          <Select
            value={provider || "_all"}
            onValueChange={(value) =>
              updateParam("provider", value === "_all" ? "" : value)
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All providers</SelectItem>
              {providerOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={profile || "_all"}
            onValueChange={(value) =>
              updateParam("profile", value === "_all" ? "" : value)
            }
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Profile" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All profiles</SelectItem>
              {profileOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={health}
            onValueChange={(value) => updateParam("health", value)}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Health" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All health</SelectItem>
              <SelectItem value="healthy">Healthy</SelectItem>
              <SelectItem value="fallback">Fallback</SelectItem>
              <SelectItem value="deadline_hit">Deadline hit</SelectItem>
              <SelectItem value="failed_windows">Failed windows</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="completed media"
          value={summary.totals.completedMedia}
          summary="Completed media considered in the bounded monitoring window."
        />
        <MetricCard
          label="finalized media"
          value={summary.totals.finalizedMedia}
          summary="Completed media with readable finalization telemetry."
          tone="primary"
        />
        <MetricCard
          label="total cost"
          value={`$${summary.totals.totalCostUsd.toFixed(4)}`}
          summary="Aggregate OpenAI finalization spend in the selected window."
          tone="accent"
        />
        <MetricCard
          label="avg cost / minute"
          value={`$${summary.averages.costPerMediaMinuteUsd.toFixed(4)}`}
          summary="Average finalization spend per processed media minute."
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="total tokens"
          value={summary.totals.totalTokens.toLocaleString()}
          summary="Prompt and completion tokens combined."
        />
        <MetricCard
          label="coverage rate"
          value={`${toPercent(summary.averages.coverageRate)}%`}
          summary="Share of final segments covered by LLM-revised output."
        />
        <MetricCard
          label="fallback rate"
          value={`${toPercent(summary.averages.fallbackRate)}%`}
          summary="Share of final segments that remained on NMT fallback."
        />
        <MetricCard
          label="deadline hits"
          value={summary.totals.deadlineHitMedia}
          summary="Media items whose finalization budget deadline was reached."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <BreakdownCard
          title="Daily usage"
          description="Media count, cost, and token usage by completion date."
          rows={summary.breakdowns.dailyUsage.map((item) => ({
            label: item.date,
            value: `${item.mediaCount} media · $${item.totalCostUsd.toFixed(4)} · ${item.totalTokens.toLocaleString()} tok`,
          }))}
        />
        <BreakdownCard
          title="Provider + profile mix"
          description="Current LLM provider concentration and finalization policy shape."
          rows={[
            ...summary.breakdowns.byProvider.map((item) => ({
              label: item.provider,
              value: `${item.mediaCount} media · $${item.totalCostUsd.toFixed(4)} · ${item.totalTokens.toLocaleString()} tok`,
            })),
            ...summary.breakdowns.byProfile.map((item) => ({
              label: item.profile,
              value: `${item.mediaCount} media · $${item.totalCostUsd.toFixed(4)} · ${toPercent(item.averageCoverageRate)}% coverage`,
            })),
          ]}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <BreakdownCard
          title="Route mix"
          description="Source-target routes currently contributing finalization spend."
          rows={summary.breakdowns.byRoute.map((item) => ({
            label: `${item.sourceLanguage} → ${item.targetLanguage}`,
            value: `${item.mediaCount} media · $${item.totalCostUsd.toFixed(4)} · ${toPercent(item.averageCoverageRate)}% coverage`,
          }))}
        />
        <Card className="panel-glow border border-border/70 bg-background/72">
          <CardHeader>
            <CardTitle>Window health</CardTitle>
            <CardDescription>
              Finalization timing and fallback risk in the current filter set.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            <SignalRow
              label="Average window success"
              value={`${toPercent(summary.averages.averageWindowSuccessRate)}%`}
            />
            <SignalRow
              label="Fallback segments"
              value={summary.totals.totalFallbackSegments.toLocaleString()}
            />
            <SignalRow
              label="Failed-window media"
              value={String(summary.totals.failedWindowMedia)}
            />
            <SignalRow
              label="Prompt tokens"
              value={summary.totals.totalPromptTokens.toLocaleString()}
            />
            <SignalRow
              label="Completion tokens"
              value={summary.totals.totalCompletionTokens.toLocaleString()}
            />
          </CardContent>
        </Card>
      </section>

      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardHeader>
          <CardTitle>Recent finalized media</CardTitle>
          <CardDescription>
            Per-media drill-down for provider, profile, windows, fallback, and
            spend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {media.data.length === 0 ? (
            <div className="flex min-h-36 items-center justify-center rounded-3xl border border-dashed border-border/80 px-4 py-8 text-center text-sm text-muted-foreground">
              No finalized media matched the current filter set.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Completed</th>
                    <th className="px-4 py-3 font-medium">Media</th>
                    <th className="px-4 py-3 font-medium">Route</th>
                    <th className="px-4 py-3 font-medium">Profile</th>
                    <th className="px-4 py-3 font-medium">Windows</th>
                    <th className="px-4 py-3 font-medium">Fallback</th>
                    <th className="px-4 py-3 font-medium">Tokens</th>
                    <th className="px-4 py-3 font-medium">Cost</th>
                    <th className="px-4 py-3 font-medium">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {media.data.map((item) => (
                    <MediaRow key={item.mediaId} item={item} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {media.total} total · page {media.page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => updateParam("page", String(page - 1))}
              >
                <RiArrowLeftLine className="size-4" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => updateParam("page", String(page + 1))}
              >
                Next
                <RiArrowRightLine className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

type MetricCardProps = {
  label: string
  value: number | string
  summary: string
  tone?: "default" | "primary" | "accent"
}

const MetricCard = ({
  label,
  value,
  summary,
  tone = "default",
}: MetricCardProps) => (
  <Card
    className={
      tone === "primary"
        ? "panel-glow border border-primary/30 bg-primary/12"
        : tone === "accent"
          ? "panel-glow border border-accent/30 bg-accent/12"
          : "panel-glow border border-border/70 bg-background/72"
    }
  >
    <CardHeader className="gap-3">
      <div className="signal-text">{label}</div>
      <CardTitle className="text-3xl tracking-[0.12em] uppercase">
        {value}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-sm leading-6 text-muted-foreground">{summary}</p>
    </CardContent>
  </Card>
)

type BreakdownCardProps = {
  title: string
  description: string
  rows: Array<{
    label: string
    value: string
  }>
}

const BreakdownCard = ({ title, description, rows }: BreakdownCardProps) => (
  <Card className="panel-glow border border-border/70 bg-background/72">
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/80 px-4 py-8 text-center text-sm text-muted-foreground">
          No data in the current filter set.
        </div>
      ) : (
        rows.map((row) => (
          <div
            key={`${row.label}:${row.value}`}
            className="flex items-center justify-between rounded-3xl border border-border/70 bg-card px-4 py-3"
          >
            <span className="signal-text text-card-foreground">{row.label}</span>
            <span className="text-right text-sm text-muted-foreground">
              {row.value}
            </span>
          </div>
        ))
      )}
    </CardContent>
  </Card>
)

const SignalRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between rounded-3xl border border-border/70 bg-card px-4 py-3">
    <span>{label}</span>
    <span className="font-heading text-card-foreground">{value}</span>
  </div>
)

const MediaRow = ({ item }: { item: AdminTranslationFinalizationMediaListItem }) => {
  const health = getHealthBadge(item)

  return (
    <tr className="border-b border-border/50 transition-colors hover:bg-muted/30 last:border-0">
      <td className="px-4 py-3 text-muted-foreground">
        {new Date(item.completedAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-card-foreground">{item.title}</div>
        <div className="text-xs text-muted-foreground">{item.userEmail}</div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {item.sourceLanguage} → {item.targetLanguage}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        <div>{item.profile}</div>
        <div className="text-xs">{item.provider}</div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {item.completedWindows}/{item.attemptedWindows}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {item.fallbackSegments}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {item.totalTokens.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        ${item.totalCostUsd.toFixed(4)}
      </td>
      <td className="px-4 py-3">
        <span className={health.className}>{health.label}</span>
      </td>
    </tr>
  )
}

function getHealthBadge(item: AdminTranslationFinalizationMediaListItem) {
  if (
    item.failedWindows > 0 ||
    item.invalidWindows > 0 ||
    item.timedOutWindows > 0
  ) {
    return {
      label: "failed",
      className:
        "rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive",
    }
  }

  if (item.deadlineHit) {
    return {
      label: "deadline",
      className:
        "rounded-full border border-accent/30 bg-accent/12 px-2.5 py-1 text-xs font-medium text-accent-foreground",
    }
  }

  if (item.fallbackSegments > 0) {
    return {
      label: "fallback",
      className:
        "rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-card-foreground",
    }
  }

  return {
    label: "healthy",
    className:
      "rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary",
  }
}

function toPercent(value: number): number {
  return Math.round(value * 100)
}
