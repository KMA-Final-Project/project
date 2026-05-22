import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"

export const MonitoringQueuesPage = () => {
  return (
    <Card className="panel-glow border border-border/70 bg-background/72">
      <CardHeader>
        <CardTitle>Queue monitoring scaffold</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
        <p>
          This route will track the transcription and ai-processing lanes with
          short-interval refresh.
        </p>
        <p>
          Required backend contract: GET /admin/monitoring/queues with waiting,
          active, delayed, and failed counts per queue.
        </p>
      </CardContent>
    </Card>
  )
}
