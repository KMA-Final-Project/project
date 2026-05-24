import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiLoader4Line,
  RiRefreshLine,
  RiSparklingLine,
} from "@remixicon/react"

import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  aiExplainMetricsQuery,
  aiExplainSessionsQuery,
} from "@/features/ai-explain/ai-explain-queries.ts"
import type {
  AiExplainDailyUsage,
  AiExplainSessionItem,
  AiExplainTopSegment,
} from "@/features/ai-explain/types.ts"

const PAGE_SIZE = 20

export const AiExplainPage = () => {
  const [period, setPeriod] = useState<"7d" | "30d">("7d")
  const [page, setPage] = useState(1)
  const metricsQuery = useQuery(aiExplainMetricsQuery(period))
  const sessionsQuery = useQuery(aiExplainSessionsQuery(page, PAGE_SIZE))

  if (metricsQuery.isPending || sessionsQuery.isPending) {
    return (
      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardContent className="flex min-h-72 items-center justify-center gap-3 text-muted-foreground">
          <RiLoader4Line className="size-5 animate-spin" />
          Loading Kapter Explain telemetry...
        </CardContent>
      </Card>
    )
  }

  if (metricsQuery.isError || sessionsQuery.isError) {
    return (
      <Card className="panel-glow border border-destructive/30 bg-destructive/10">
        <CardHeader>
          <CardTitle>Failed to load AI Explain telemetry</CardTitle>
          <CardDescription>
            The admin shell is healthy, but one of the AI Explain endpoints did
            not respond successfully.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => {
              void metricsQuery.refetch()
              void sessionsQuery.refetch()
            }}
          >
            <RiRefreshLine data-icon="inline-start" className="size-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const metrics = metricsQuery.data
  const sessions = sessionsQuery.data
  const totalPages = Math.max(1, Math.ceil(sessions.total / PAGE_SIZE))

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="signal-text">ai language assistant</div>
          <h2 className="mt-3 font-heading text-3xl text-card-foreground">
            Kapter Explain observability
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Usage, cache behavior, guardrail quality, and recent segment-scoped
            conversations from the new Explain chatbot.
          </p>
        </div>
        <div className="flex gap-2">
          {(["7d", "30d"] as const).map((option) => (
            <Button
              key={option}
              variant={period === option ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setPeriod(option)
                setPage(1)
              }}
            >
              {option}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void metricsQuery.refetch()
              void sessionsQuery.refetch()
            }}
          >
            <RiRefreshLine className="size-4" />
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="requests"
          value={metrics.totalRequests}
          summary="All Explain requests in the selected window."
        />
        <MetricCard
          label="credits"
          value={metrics.totalCreditsConsumed}
          summary="Confirmed billable AI credit consumption."
          tone="primary"
        />
        <MetricCard
          label="cache hit"
          value={`${toPercent(metrics.cacheHitRate)}%`}
          summary="Initial explanations served before credit reservation."
          tone="accent"
        />
        <MetricCard
          label="guardrails"
          value={`${toPercent(metrics.guardrailRejectionRate)}%`}
          summary="Requests rejected by language-learning scope controls."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <UsageCard dailyUsage={metrics.dailyUsage} />
        <Card className="panel-glow border border-border/70 bg-background/72">
          <CardHeader>
            <CardTitle>Quality signals</CardTitle>
            <CardDescription>
              Lightweight operational signals from usage logs and feedback.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            <SignalRow
              label="Positive feedback"
              value={`${toPercent(metrics.feedbackPositiveRate)}%`}
            />
            <SignalRow
              label="Average latency"
              value={`${metrics.averageLatencyMs} ms`}
            />
            <SignalRow
              label="Input tokens"
              value={metrics.totalTokensInput.toLocaleString()}
            />
            <SignalRow
              label="Output tokens"
              value={metrics.totalTokensOutput.toLocaleString()}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <TopSegmentsCard segments={metrics.topSegments} />
        <SessionsCard
          sessions={sessions.data}
          page={page}
          totalPages={totalPages}
          total={sessions.total}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() =>
            setPage((current) => Math.min(totalPages, current + 1))
          }
        />
      </section>
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

const UsageCard = ({ dailyUsage }: { dailyUsage: AiExplainDailyUsage[] }) => {
  const maxRequests = Math.max(1, ...dailyUsage.map((item) => item.requests))

  return (
    <Card className="panel-glow border border-border/70 bg-background/72">
      <CardHeader>
        <CardTitle>Daily usage</CardTitle>
        <CardDescription>
          Requests and consumed credits across the selected period.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {dailyUsage.map((item) => (
          <div key={item.date} className="grid gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-heading tracking-[0.2em] text-card-foreground uppercase">
                {item.date.slice(5)}
              </span>
              <span className="text-muted-foreground">
                {item.requests} req · {item.credits} credits
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary"
                style={{
                  width: `${Math.max(4, (item.requests / maxRequests) * 100)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

type SignalRowProps = {
  label: string
  value: string
}

const SignalRow = ({ label, value }: SignalRowProps) => (
  <div className="flex items-center justify-between rounded-3xl border border-border/70 bg-card px-4 py-3">
    <span>{label}</span>
    <span className="font-heading text-card-foreground">{value}</span>
  </div>
)

const TopSegmentsCard = ({
  segments,
}: {
  segments: AiExplainTopSegment[]
}) => (
  <Card className="panel-glow border border-border/70 bg-background/72">
    <CardHeader>
      <CardTitle>Top requested segments</CardTitle>
      <CardDescription>
        Canonical backend-resolved segment text from usage snapshots.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {segments.length === 0 ? (
        <EmptyState label="No Explain segment usage yet." />
      ) : (
        segments.map((segment) => (
          <div
            key={`${segment.mediaId}:${segment.segmentIndex}`}
            className="rounded-3xl border border-border/70 bg-card px-4 py-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="signal-text">{segment.mediaTitle}</div>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-card-foreground">
                  {segment.segmentText}
                </p>
              </div>
              <div className="rounded-2xl border border-primary/30 bg-primary/10 px-3 py-2 text-center">
                <div className="font-heading text-lg text-card-foreground">
                  {segment.requestCount}
                </div>
                <div className="signal-text">req</div>
              </div>
            </div>
          </div>
        ))
      )}
    </CardContent>
  </Card>
)

type SessionsCardProps = {
  sessions: AiExplainSessionItem[]
  page: number
  totalPages: number
  total: number
  onPrevious: () => void
  onNext: () => void
}

const SessionsCard = ({
  sessions,
  page,
  totalPages,
  total,
  onPrevious,
  onNext,
}: SessionsCardProps) => (
  <Card className="panel-glow border border-border/70 bg-background/72">
    <CardHeader>
      <div className="flex items-start justify-between gap-4">
        <div>
          <CardTitle>Recent sessions</CardTitle>
          <CardDescription>
            Segment-scoped chat sessions sorted by latest activity.
          </CardDescription>
        </div>
        <RiSparklingLine className="size-6 text-primary" />
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      {sessions.length === 0 ? (
        <EmptyState label="No Explain chat sessions yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Media</th>
                <th className="px-4 py-3 text-right font-medium">Segment</th>
                <th className="px-4 py-3 text-right font-medium">Messages</th>
                <th className="px-4 py-3 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr
                  key={session.id}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="px-4 py-3 text-card-foreground">
                    {session.userEmail}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {session.mediaTitle}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    #{session.segmentIndex + 1}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {session.messageCount}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} sessions · page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={onPrevious}
          >
            <RiArrowLeftLine className="size-4" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={onNext}
          >
            Next
            <RiArrowRightLine className="size-4" />
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
)

const EmptyState = ({ label }: { label: string }) => (
  <div className="flex min-h-36 items-center justify-center rounded-3xl border border-dashed border-border/80 px-4 py-8 text-center text-sm text-muted-foreground">
    {label}
  </div>
)

function toPercent(value: number): number {
  return Math.round(value * 100)
}
