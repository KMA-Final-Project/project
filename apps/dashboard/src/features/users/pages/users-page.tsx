import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiLoader4Line,
  RiRefreshLine,
  RiSearchLine,
  RiUserLine,
} from "@remixicon/react"

import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { Input } from "@/components/ui/input.tsx"
import { usersListQuery } from "@/features/users/users-queries.ts"
import type { AdminUserListItem } from "@/features/users/types.ts"

const PAGE_SIZE = 20

export const UsersPage = () => {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<"ALL" | "USER" | "ADMIN">("ALL")

  const usersQuery = useQuery(usersListQuery({ page, limit: PAGE_SIZE }))

  // Client-side search and role filter (admin-only endpoint — scale is acceptable)
  const filtered = useMemo(() => {
    const all = usersQuery.data?.data ?? []
    return all.filter((u) => {
      const matchesRole = roleFilter === "ALL" || u.role === roleFilter
      const term = search.toLowerCase()
      const matchesSearch =
        !term ||
        u.fullName.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term)
      return matchesRole && matchesSearch
    })
  }, [usersQuery.data, search, roleFilter])

  const total = usersQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (usersQuery.isPending) {
    return (
      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardContent className="flex min-h-72 items-center justify-center gap-3 text-muted-foreground">
          <RiLoader4Line className="size-5 animate-spin" />
          Loading users…
        </CardContent>
      </Card>
    )
  }

  if (usersQuery.isError) {
    return (
      <Card className="panel-glow border border-destructive/30 bg-destructive/10">
        <CardHeader>
          <CardTitle>Failed to load users</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => usersQuery.refetch()}>
            <RiRefreshLine data-icon="inline-start" className="size-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricChip label="total users" value={String(total)} />
        <MetricChip
          label="shown (filtered)"
          value={String(filtered.length)}
          tone="accent"
        />
        <MetricChip
          label="page"
          value={`${page} / ${totalPages}`}
          tone="primary"
        />
      </div>

      {/* Filters */}
      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <div className="relative flex-1 min-w-48">
            <RiSearchLine className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="user-search"
              className="pl-9"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5">
            {(["ALL", "USER", "ADMIN"] as const).map((r) => (
              <Button
                key={r}
                size="sm"
                variant={roleFilter === r ? "default" : "outline"}
                onClick={() => setRoleFilter(r)}
              >
                {r === "ALL" ? "All roles" : r}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => usersQuery.refetch()}
          >
            <RiRefreshLine className="size-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center p-8">
              <RiUserLine className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No users match your filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70">
                    <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                      Name
                    </th>
                    <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                      Email
                    </th>
                    <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                      Role
                    </th>
                    <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                      Plan
                    </th>
                    <th className="px-6 py-4 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right font-medium text-muted-foreground">
                      Quota used
                    </th>
                    <th className="px-6 py-4 text-right font-medium text-muted-foreground">
                      Joined
                    </th>
                    <th className="px-6 py-4 text-right font-medium text-muted-foreground">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => (
                    <UserRow key={user.id} user={user} />
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
          {total} total users · page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <RiArrowLeftLine className="size-4" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <RiArrowRightLine className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ===== Row =====

type UserRowProps = { user: AdminUserListItem }

const UserRow = ({ user }: UserRowProps) => (
  <tr className="border-b border-border/50 transition-colors hover:bg-muted/30 last:border-0">
    <td className="px-6 py-4 font-medium text-card-foreground">
      {user.fullName}
    </td>
    <td className="px-6 py-4 text-muted-foreground">{user.email}</td>
    <td className="px-6 py-4">
      <span
        className={
          user.role === "ADMIN"
            ? "rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            : "rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground"
        }
      >
        {user.role}
      </span>
    </td>
    <td className="px-6 py-4 text-muted-foreground">
      {user.currentPlanName ?? "—"}
    </td>
    <td className="px-6 py-4">
      {user.subscriptionStatus ? (
        <span
          className={
            user.subscriptionStatus === "ACTIVE"
              ? "rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent-foreground"
              : "rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground"
          }
        >
          {user.subscriptionStatus.toLowerCase()}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </td>
    <td className="px-6 py-4 text-right text-muted-foreground">
      {formatDuration(user.quotaUsageCurrentMonthSeconds)}
    </td>
    <td className="px-6 py-4 text-right text-muted-foreground">
      {new Date(user.createdAt).toLocaleDateString()}
    </td>
    <td className="px-6 py-4 text-right">
      <Link to={`/users/${user.id}`}>
        <Button variant="outline" size="sm">
          View
        </Button>
      </Link>
    </td>
  </tr>
)

// ===== Helpers =====

type MetricChipProps = {
  label: string
  value: string
  tone?: "default" | "primary" | "accent"
}

const MetricChip = ({ label, value, tone = "default" }: MetricChipProps) => (
  <div
    className={
      tone === "primary"
        ? "rounded-3xl border border-primary/30 bg-primary/12 px-4 py-4"
        : tone === "accent"
          ? "rounded-3xl border border-accent/30 bg-accent/12 px-4 py-4"
          : "rounded-3xl border border-border/70 bg-card px-4 py-4"
    }
  >
    <div className="signal-text">{label}</div>
    <div className="mt-3 font-heading text-3xl text-card-foreground">{value}</div>
  </div>
)

const formatDuration = (seconds: number) => {
  if (seconds === 0) return "0m"
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 60)}m`
}
