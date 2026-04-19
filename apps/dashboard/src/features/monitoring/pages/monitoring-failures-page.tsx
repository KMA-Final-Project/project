import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"

export const MonitoringFailuresPage = () => {
  return (
    <Card className="panel-glow border border-border/70 bg-background/72">
      <CardHeader>
        <CardTitle>Failure diagnostics scaffold</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
        <p>
          This route will focus on failed media jobs, queue bottlenecks, and
          retry-oriented diagnosis.
        </p>
        <p>
          Required backend contract: GET /admin/monitoring/failures with queue,
          media, fail reason, and timestamp filters.
        </p>
      </CardContent>
    </Card>
  )
}
