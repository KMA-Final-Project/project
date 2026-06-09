import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useParams } from "react-router"
import {
  RiArrowLeftLine,
  RiLoader4Line,
  RiRefreshLine,
  RiShieldUserLine,
  RiTimeLine,
  RiUserLine,
} from "@remixicon/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { RoleChangeDialog } from "@/features/users/components/role-change-dialog.tsx"
import { updateUserRole } from "@/features/users/users-api.ts"
import { userDetailQuery, usersKeys } from "@/features/users/users-queries.ts"
import { useAuth } from "@/features/auth/auth-provider.tsx"
import type {
  AdminUserDetail,
  AdminUserSubscriptionSnapshot,
  AdminUserUsageHistoryItem,
} from "@/features/users/types.ts"

export const UserDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const userQuery = useQuery(userDetailQuery(id!))
  const [roleDialog, setRoleDialog] = useState(false)

  const roleMutation = useMutation({
    mutationFn: (role: "USER" | "ADMIN") => updateUserRole(id!, role),
    onSuccess: () => {
      toast.success("Role updated.")
      setRoleDialog(false)
      queryClient.invalidateQueries({ queryKey: usersKeys.all })
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update role.")
    },
  })

  if (userQuery.isPending) {
    return (
      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardContent className="flex min-h-72 items-center justify-center gap-3 text-muted-foreground">
          <RiLoader4Line className="size-5 animate-spin" />
          Loading user…
        </CardContent>
      </Card>
    )
  }

  if (userQuery.isError) {
    return (
      <Card className="panel-glow border border-destructive/30 bg-destructive/10">
        <CardHeader>
          <CardTitle>Failed to load user</CardTitle>
          <CardDescription>
            {userQuery.error instanceof Error
              ? userQuery.error.message
              : "Unknown error"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Link to="/users">
            <Button variant="outline">
              <RiArrowLeftLine data-icon="inline-start" className="size-4" />
              Back to users
            </Button>
          </Link>
          <Button onClick={() => userQuery.refetch()}>
            <RiRefreshLine data-icon="inline-start" className="size-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const user = userQuery.data

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link to="/users">
          <Button variant="outline" size="sm">
            <RiArrowLeftLine data-icon="inline-start" className="size-4" />
            Users
          </Button>
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium text-card-foreground">
          {user.fullName}
        </span>
      </div>

      {/* Profile header */}
      <ProfileCard user={user} />

      {/* Role management */}
      <RoleManagementCard
        user={user}
        isSelf={user.id === session?.user.id}
        onChangeRole={() => setRoleDialog(true)}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Subscription */}
        <SubscriptionCard sub={user.currentSubscription} />

        {/* Quota usage */}
        <QuotaCard user={user} />
      </div>

      {/* Usage history */}
      {user.recentUsageHistory.length > 0 && (
        <UsageHistoryCard history={user.recentUsageHistory} />
      )}

      {/* Role change dialog */}
      {roleDialog && (
        <RoleChangeDialog
          open={roleDialog}
          onOpenChange={setRoleDialog}
          userName={user.fullName}
          currentRole={user.role}
          targetRole={user.role === "ADMIN" ? "USER" : "ADMIN"}
          isPending={roleMutation.isPending}
          onConfirm={() =>
            roleMutation.mutate(
              user.role === "ADMIN" ? "USER" : "ADMIN",
            )
          }
        />
      )}
    </div>
  )
}

// ===== Role Management Card =====

type RoleManagementCardProps = {
  user: AdminUserDetail
  isSelf: boolean
  onChangeRole: () => void
}

const RoleManagementCard = ({
  user,
  isSelf,
  onChangeRole,
}: RoleManagementCardProps) => (
  <Card className="panel-glow border border-border/70 bg-background/72">
    <CardHeader>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <RiShieldUserLine className="size-5 text-accent" />
          <CardTitle className="text-base">Role management</CardTitle>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isSelf}
          onClick={onChangeRole}
        >
          Change role
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      <div className="flex items-center gap-3">
        <span
          className={
            user.role === "ADMIN"
              ? "rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
              : "rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground"
          }
        >
          {user.role}
        </span>
        {isSelf && (
          <span className="text-xs text-muted-foreground">
            You cannot change your own role.
          </span>
        )}
      </div>
    </CardContent>
  </Card>
)

// ===== Profile Card =====

const ProfileCard = ({ user }: { user: AdminUserDetail }) => (
  <Card className="panel-glow border border-border/70 bg-background/72">
    <CardHeader>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-card">
            <RiUserLine className="size-6 text-muted-foreground" />
          </div>
          <div>
            <CardTitle>{user.fullName}</CardTitle>
            <CardDescription className="mt-0.5">{user.email}</CardDescription>
          </div>
        </div>
        <span
          className={
            user.role === "ADMIN"
              ? "rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
              : "rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground"
          }
        >
          {user.role}
        </span>
      </div>
    </CardHeader>
    <Separator className="mb-4 opacity-50" />
    <CardContent>
      <div className="grid gap-4 sm:grid-cols-3 text-sm">
        <InfoCell
          label="Email verified"
          value={user.emailVerified ? "Yes" : "No"}
        />
        <InfoCell
          label="Total media items"
          value={String(user.totalMediaItems)}
        />
        <InfoCell
          label="Joined"
          value={new Date(user.createdAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        />
      </div>
    </CardContent>
  </Card>
)

// ===== Subscription Card =====

const SubscriptionCard = ({
  sub,
}: {
  sub: AdminUserSubscriptionSnapshot | null
}) => (
  <Card className="panel-glow border border-border/70 bg-background/72">
    <CardHeader>
      <div className="flex items-center gap-3">
        <RiShieldUserLine className="size-5 text-accent" />
        <CardTitle className="text-base">Current subscription</CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      {!sub ? (
        <p className="text-sm text-muted-foreground">No subscription found.</p>
      ) : (
        <div className="grid gap-3 text-sm">
          <InfoCell label="Plan" value={sub.planName ?? "—"} />
          <InfoCell label="Variant" value={sub.variantName ?? "—"} />
          <InfoCell
            label="Billing cycle"
            value={
              sub.billingCycleType
                ? sub.billingCycleType.toLowerCase().replace(/_/g, " ")
                : "—"
            }
          />
          <InfoCell
            label="Status"
            value={sub.status.toLowerCase()}
            highlight={sub.status === "ACTIVE"}
          />
          <InfoCell
            label="Price snapshot"
            value={formatPrice(sub.priceSnapshot)}
          />
          <InfoCell
            label="Monthly quota"
            value={formatDuration(sub.monthlyQuotaSecondsSnapshot)}
          />
          <InfoCell
            label="Max duration / file"
            value={formatDuration(sub.maxDurationPerFileSnapshot)}
          />
          <InfoCell
            label="Period"
            value={`${new Date(sub.startDate).toLocaleDateString()} → ${new Date(sub.endDate).getFullYear() > 9000 ? "Lifetime" : new Date(sub.endDate).toLocaleDateString()}`}
          />
        </div>
      )}
    </CardContent>
  </Card>
)

// ===== Quota Card =====

const QuotaCard = ({ user }: { user: AdminUserDetail }) => {
  const used = user.quotaUsageCurrentMonthSeconds
  const limit = user.currentSubscription?.monthlyQuotaSecondsSnapshot ?? 0
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0

  return (
    <Card className="panel-glow border border-border/70 bg-background/72">
      <CardHeader>
        <div className="flex items-center gap-3">
          <RiTimeLine className="size-5 text-accent" />
          <CardTitle className="text-base">Quota — this month</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="signal-text">used</div>
            <div className="mt-1 font-heading text-3xl text-card-foreground">
              {formatDuration(used)}
            </div>
          </div>
          {limit > 0 && (
            <div className="text-right">
              <div className="signal-text">limit</div>
              <div className="mt-1 font-heading text-3xl text-card-foreground">
                {formatDuration(limit)}
              </div>
            </div>
          )}
        </div>

        {limit > 0 && (
          <div className="space-y-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-destructive" : "bg-accent"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-right text-xs text-muted-foreground">{pct}% used</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ===== Usage History Card =====

const UsageHistoryCard = ({
  history,
}: {
  history: AdminUserUsageHistoryItem[]
}) => (
  <Card className="panel-glow border border-border/70 bg-background/72">
    <CardHeader>
      <CardTitle className="text-base">Recent billing cycles</CardTitle>
      <CardDescription>Last {history.length} cycles</CardDescription>
    </CardHeader>
    <CardContent className="p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/70">
            <th className="px-6 py-3 text-left font-medium text-muted-foreground">
              Cycle
            </th>
            <th className="px-6 py-3 text-right font-medium text-muted-foreground">
              Used
            </th>
            <th className="px-6 py-3 text-right font-medium text-muted-foreground">
              Limit at that time
            </th>
            <th className="px-6 py-3 text-right font-medium text-muted-foreground">
              Utilisation
            </th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => {
            const pct =
              h.quotaLimitAtThatTime > 0
                ? Math.min(
                    100,
                    Math.round(
                      (h.totalSecondsUsed / h.quotaLimitAtThatTime) * 100,
                    ),
                  )
                : 0
            return (
              <tr
                key={h.id}
                className="border-b border-border/50 last:border-0"
              >
                <td className="px-6 py-3 text-muted-foreground">
                  {new Date(h.cycleStartDate).toLocaleDateString()} →{" "}
                  {new Date(h.cycleEndDate).toLocaleDateString()}
                </td>
                <td className="px-6 py-3 text-right">
                  {formatDuration(h.totalSecondsUsed)}
                </td>
                <td className="px-6 py-3 text-right text-muted-foreground">
                  {formatDuration(h.quotaLimitAtThatTime)}
                </td>
                <td className="px-6 py-3 text-right">
                  <span
                    className={
                      pct >= 90
                        ? "text-destructive"
                        : pct >= 70
                          ? "text-yellow-500"
                          : "text-accent-foreground"
                    }
                  >
                    {pct}%
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </CardContent>
  </Card>
)

// ===== Helpers =====

const InfoCell = ({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) => (
  <div>
    <div className="signal-text">{label}</div>
    <div
      className={`mt-1 ${highlight ? "font-medium text-accent-foreground" : "text-card-foreground"}`}
    >
      {value}
    </div>
  </div>
)

const formatDuration = (seconds: number) => {
  if (seconds === 0) return "0m"
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`
  return `${Math.round(seconds / 60)}m`
}

const formatPrice = (rawPrice: string) => {
  const price = Number(rawPrice)
  if (Number.isNaN(price)) return rawPrice
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(price)
}
