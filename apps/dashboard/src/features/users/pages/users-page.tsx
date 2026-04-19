import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"

export const UsersPage = () => {
  return (
    <Card className="panel-glow border border-border/70 bg-background/72">
      <CardHeader>
        <CardTitle>User management scaffold</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
        <p>
          This page is reserved for searchable user administration, role
          filters, subscription snapshots, and usage history.
        </p>
        <p>
          Required backend contract: paginated GET /admin/users and detailed GET
          /admin/users/:id.
        </p>
      </CardContent>
    </Card>
  )
}
