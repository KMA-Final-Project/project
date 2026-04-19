import { useQuery } from "@tanstack/react-query"
import { RiLoader4Line, RiRefreshLine } from "@remixicon/react"

import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { overviewQuery } from "@/features/overview/overview-queries.ts"
import type { QueueOverviewItem } from "@/features/overview/types.ts"

export const OverviewPage = () => {
  const overview = useQuery(overviewQuery())

  if (overview.isPending) {
    return (
      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardContent className="flex min-h-72 items-center justify-center gap-3 text-muted-foreground">
          <RiLoader4Line className="size-5 animate-spin" />
          Loading overview telemetry...
        </CardContent>
      </Card>
    )
  }

  if (overview.isError) {
    return (
      <Card className="panel-glow border border-destructive/30 bg-destructive/10">
        <CardHeader>
          <CardTitle>Failed to load admin overview</CardTitle>
          <CardDescription>
            The dashboard shell is healthy, but the new overview endpoint did
            not respond successfully.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => overview.refetch()}>
            <RiRefreshLine data-icon="inline-start" className="size-4" />
            Retry request
          </Button>
        </CardContent>
      </Card>
    )
  }

  const data = overview.data

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total users"
          value={data.totalUsers}
          summary="Registered users across all roles."
        />
        <MetricCard
          label="Active subscriptions"
          value={data.activeSubscriptions}
          summary="Snapshot-backed active subscription records."
        />
        <MetricCard
          label="Processed media"
          value={data.processedMedia}
          summary="Completed subtitle jobs from durable media status."
        />
        <MetricCard
          label="Failed media"
          value={data.failedMedia}
          summary="Items that ended in FAILED and need operator attention."
          tone="destructive"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="panel-glow border border-border/70 bg-background/72">
          <CardHeader>
            <CardTitle>Pipeline state</CardTitle>
            <CardDescription>
              Live metrics from the new admin overview endpoint.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm leading-6 text-muted-foreground">
            <p>Media currently processing: {data.processingMedia}</p>
            <p>
              Queue telemetry refreshes every 15 seconds while this page is
              visible.
            </p>
            <p>
              The next domain contracts to add are the user administration and
              monitoring detail endpoints.
            </p>
          </CardContent>
        </Card>

        <Card className="panel-glow border border-border/70 bg-background/72">
          <CardHeader>
            <CardTitle>Queue lanes</CardTitle>
            <CardDescription>
              BullMQ queue counts currently exposed by the backend overview
              contract.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.queues.map((queue) => (
              <QueueCard key={queue.name} queue={queue} />
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

type MetricCardProps = {
  label: string
  value: number
  summary: string
  tone?: "default" | "destructive"
}

const MetricCard = ({
  label,
  value,
  summary,
  tone = "default",
}: MetricCardProps) => {
  return (
    <Card
      className={
        tone === "destructive"
          ? "panel-glow border border-destructive/30 bg-destructive/10"
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
}

type QueueCardProps = {
  queue: QueueOverviewItem
}

const QueueCard = ({ queue }: QueueCardProps) => {
  return (
    <div className="rounded-3xl border border-border/70 bg-card px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-heading text-sm tracking-[0.22em] text-card-foreground uppercase">
            {queue.name}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            waiting {queue.waiting} · active {queue.active} · delayed{" "}
            {queue.delayed}
          </div>
        </div>
        <div className="text-right">
          <div className="signal-text">health</div>
          <div className="mt-2 font-heading text-xl text-card-foreground">
            {queue.failed === 0 ? "stable" : "watch"}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm text-muted-foreground">
        <div className="rounded-2xl border border-border/70 px-3 py-2">
          <div className="signal-text">completed</div>
          <div className="mt-2 font-heading text-base text-card-foreground">
            {queue.completed}
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 px-3 py-2">
          <div className="signal-text">failed</div>
          <div className="mt-2 font-heading text-base text-card-foreground">
            {queue.failed}
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 px-3 py-2">
          <div className="signal-text">paused</div>
          <div className="mt-2 font-heading text-base text-card-foreground">
            {queue.paused}
          </div>
        </div>
      </div>
    </div>
  )
}
