import { useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "react-router"
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiErrorWarningLine,
  RiLoader4Line,
  RiRefreshLine,
} from "@remixicon/react"

import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
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
import { monitoringFailuresQuery } from "@/features/monitoring/monitoring-queries.ts"
import type {
  AdminMonitoringFailureSource,
  AdminMonitoringFailureItem,
} from "@/features/monitoring/types.ts"

const PAGE_SIZE = 20

export const MonitoringFailuresPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()

  const source: AdminMonitoringFailureSource =
    searchParams.get("source") === "QUEUE" ? "QUEUE" : "MEDIA"
  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const search = searchParams.get("search") ?? ""
  const originType = searchParams.get("originType") ?? ""
  const failCode = searchParams.get("failCode") ?? ""
  const queueName = searchParams.get("queueName") ?? ""
  const from = searchParams.get("from") ?? ""
  const to = searchParams.get("to") ?? ""

  const updateParam = useCallback(
    (key: string, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (value) {
          next.set(key, value)
        } else {
          next.delete(key)
        }
        return next
      })
    },
    [setSearchParams],
  )

  const setSource = useCallback(
    (nextSource: AdminMonitoringFailureSource) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set("source", nextSource)
        next.set("page", "1")
        next.delete("originType")
        next.delete("failCode")
        next.delete("queueName")
        return next
      })
    },
    [setSearchParams],
  )

  const queryParams = {
    source,
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    from: from || undefined,
    to: to || undefined,
    originType: source === "MEDIA" && originType ? originType : undefined,
    failCode: source === "MEDIA" && failCode ? failCode : undefined,
    queueName: source === "QUEUE" && queueName ? queueName : undefined,
  }

  const failuresQuery = useQuery(monitoringFailuresQuery(queryParams))

  if (failuresQuery.isPending) {
    return (
      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardContent className="flex min-h-72 items-center justify-center gap-3 text-muted-foreground">
          <RiLoader4Line className="size-5 animate-spin" />
          Loading failure diagnostics...
        </CardContent>
      </Card>
    )
  }

  if (failuresQuery.isError) {
    return (
      <Card className="panel-glow border border-destructive/30 bg-destructive/10">
        <CardHeader>
          <CardTitle>Failed to load failure data</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => failuresQuery.refetch()}>
            <RiRefreshLine data-icon="inline-start" className="size-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { summary, data, total } = failuresQuery.data
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricChip
          label="failed media"
          value={String(summary.failedMediaCount)}
        />
        <MetricChip
          label="failed queue jobs"
          value={String(summary.failedQueueJobCount)}
          tone="accent"
        />
      </div>

      {/* Source tabs */}
      <div className="flex gap-1.5">
        {(["MEDIA", "QUEUE"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={source === s ? "default" : "outline"}
            onClick={() => setSource(s)}
          >
            {s === "MEDIA" ? "Media" : "Queue"}
          </Button>
        ))}
      </div>

      {/* Filters */}
      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <Input
            className="max-w-64"
            placeholder="Search..."
            value={search}
            onChange={(e) => {
              updateParam("search", e.target.value)
              updateParam("page", "1")
            }}
          />
          {source === "MEDIA" && (
            <>
              <Select
                value={originType || "_all"}
                onValueChange={(v) => {
                  updateParam("originType", v === "_all" ? "" : v)
                  updateParam("page", "1")
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Origin type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All origins</SelectItem>
                  <SelectItem value="LOCAL">Local</SelectItem>
                  <SelectItem value="YOUTUBE">YouTube</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={failCode || "_all"}
                onValueChange={(v) => {
                  updateParam("failCode", v === "_all" ? "" : v)
                  updateParam("page", "1")
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Fail code" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All codes</SelectItem>
                  {summary.availableFailCodes.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          {source === "QUEUE" && (
            <Select
              value={queueName || "_all"}
              onValueChange={(v) => {
                updateParam("queueName", v === "_all" ? "" : v)
                updateParam("page", "1")
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Queue" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All queues</SelectItem>
                <SelectItem value="transcription">transcription</SelectItem>
                <SelectItem value="ai-processing">ai-processing</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Input
            type="date"
            className="w-40"
            value={from}
            onChange={(e) => {
              updateParam("from", e.target.value)
              updateParam("page", "1")
            }}
          />
          <Input
            type="date"
            className="w-40"
            value={to}
            onChange={(e) => {
              updateParam("to", e.target.value)
              updateParam("page", "1")
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => failuresQuery.refetch()}
          >
            <RiRefreshLine className="size-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardContent className="p-0">
          {data.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
              <RiErrorWarningLine className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No failures found for this source and filter set.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70">
                    <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                      Occurred
                    </th>
                    {source === "MEDIA" ? (
                      <>
                        <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                          Title
                        </th>
                        <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                          Media ID
                        </th>
                        <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                          User
                        </th>
                        <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                          Origin
                        </th>
                        <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                          Code
                        </th>
                        <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                          Reason
                        </th>
                      </>
                    ) : (
                      <>
                        <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                          Queue
                        </th>
                        <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                          Job ID
                        </th>
                        <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                          Attempts
                        </th>
                        <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                          Reason
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, i) => (
                    <FailureRow key={i} item={item} source={source} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} total · page {page} of {totalPages}
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
    </div>
  )
}

type FailureRowProps = {
  item: AdminMonitoringFailureItem
  source: AdminMonitoringFailureSource
}

const FailureRow = ({ item, source }: FailureRowProps) => (
  <tr className="border-b border-border/50 transition-colors hover:bg-muted/30 last:border-0">
    <td className="px-6 py-4 text-muted-foreground">
      {new Date(item.occurredAt).toLocaleString()}
    </td>
    {source === "MEDIA" ? (
      <>
        <td className="px-6 py-4 font-medium text-card-foreground">
          {item.mediaTitle ?? "—"}
        </td>
        <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
          {item.mediaId ?? "—"}
        </td>
        <td className="px-6 py-4 text-muted-foreground">
          {item.userEmail ?? item.userId ?? "—"}
        </td>
        <td className="px-6 py-4">
          <span className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground">
            {item.originType ?? "—"}
          </span>
        </td>
        <td className="px-6 py-4">
          {item.failCode ? (
            <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
              {item.failCode}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="max-w-64 truncate px-6 py-4 text-muted-foreground">
          {item.failReason ?? "—"}
        </td>
      </>
    ) : (
      <>
        <td className="px-6 py-4">
          <span className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground">
            {item.queueName ?? "—"}
          </span>
        </td>
        <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
          {item.jobId ?? "—"}
        </td>
        <td className="px-6 py-4 text-muted-foreground">
          {item.attemptsMade ?? "—"}
        </td>
        <td className="max-w-80 truncate px-6 py-4 text-muted-foreground">
          {item.failReason ?? "—"}
        </td>
      </>
    )}
  </tr>
)

type MetricChipProps = {
  label: string
  value: string
  tone?: "default" | "accent"
}

const MetricChip = ({ label, value, tone = "default" }: MetricChipProps) => (
  <div
    className={
      tone === "accent"
        ? "rounded-3xl border border-accent/30 bg-accent/12 px-4 py-4"
        : "rounded-3xl border border-border/70 bg-card px-4 py-4"
    }
  >
    <div className="signal-text">{label}</div>
    <div className="mt-3 font-heading text-3xl text-card-foreground">
      {value}
    </div>
  </div>
)
