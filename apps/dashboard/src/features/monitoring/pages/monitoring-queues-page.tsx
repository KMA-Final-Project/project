import { useQuery } from "@tanstack/react-query"
import {
  RiLoader4Line,
  RiRefreshLine,
  RiTimeLine,
} from "@remixicon/react"

import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { monitoringQueuesQuery } from "@/features/monitoring/monitoring-queries.ts"
import type { AdminMonitoringQueueItem } from "@/features/monitoring/types.ts"

export const MonitoringQueuesPage = () => {
  const queuesQuery = useQuery(monitoringQueuesQuery())

  if (queuesQuery.isPending) {
    return (
      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardContent className="flex min-h-72 items-center justify-center gap-3 text-muted-foreground">
          <RiLoader4Line className="size-5 animate-spin" />
          Loading queue telemetry...
        </CardContent>
      </Card>
    )
  }

  if (queuesQuery.isError) {
    return (
      <Card className="panel-glow border border-destructive/30 bg-destructive/10">
        <CardHeader>
          <CardTitle>Failed to load queue data</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => queuesQuery.refetch()}>
            <RiRefreshLine data-icon="inline-start" className="size-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const data = queuesQuery.data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="signal-text">queue telemetry</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Auto-refreshes every 15 seconds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RiTimeLine className="size-3.5" />
            {new Date(data.generatedAt).toLocaleTimeString()}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => queuesQuery.refetch()}
          >
            <RiRefreshLine className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {data.queues.map((queue) => (
          <QueueDetailCard key={queue.name} queue={queue} />
        ))}
      </div>
    </div>
  )
}

type QueueDetailCardProps = {
  queue: AdminMonitoringQueueItem
}

const QueueDetailCard = ({ queue }: QueueDetailCardProps) => {
  const health = getHealthStatus(queue)

  return (
    <Card className="panel-glow border border-border/70 bg-background/72">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-heading text-lg tracking-[0.18em] uppercase">
            {queue.name}
          </CardTitle>
          <Badge
            variant={
              health.level === "critical"
                ? "destructive"
                : health.level === "watch"
                  ? "secondary"
                  : "default"
            }
            className="rounded-full"
          >
            {health.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          <MetricBox label="waiting" value={queue.waiting} />
          <MetricBox label="active" value={queue.active} />
          <MetricBox label="delayed" value={queue.delayed} />
          <MetricBox label="completed" value={queue.completed} />
          <MetricBox label="failed" value={queue.failed} destructive />
          <MetricBox label="paused" value={queue.paused} />
        </div>
      </CardContent>
    </Card>
  )
}

type MetricBoxProps = {
  label: string
  value: number
  destructive?: boolean
}

const MetricBox = ({ label, value, destructive }: MetricBoxProps) => (
  <div
    className={
      destructive && value > 0
        ? "rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2"
        : "rounded-2xl border border-border/70 px-3 py-2"
    }
  >
    <div className="signal-text">{label}</div>
    <div className="mt-2 font-heading text-base text-card-foreground">
      {value}
    </div>
  </div>
)

function getHealthStatus(queue: AdminMonitoringQueueItem) {
  if (queue.failed > 10 || queue.waiting > 50) {
    return { level: "critical" as const, label: "critical" }
  }
  if (queue.failed > 0 || queue.waiting > 10) {
    return { level: "watch" as const, label: "watch" }
  }
  return { level: "stable" as const, label: "stable" }
}
