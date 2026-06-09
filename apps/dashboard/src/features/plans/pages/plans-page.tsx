import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import {
  RiAddLine,
  RiArrowRightLine,
  RiLoader4Line,
  RiRefreshLine,
  RiStackLine,
} from "@remixicon/react"

import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { PlanFormDialog } from "@/features/plans/components/plan-form-dialog.tsx"
import { plansListQuery } from "@/features/plans/plans-queries.ts"
import type { SubscriptionPlan } from "@/features/plans/types.ts"

export const PlansPage = () => {
  const plansQuery = useQuery(plansListQuery())
  const [createPlanOpen, setCreatePlanOpen] = useState(false)

  const totals = useMemo(() => {
    const plans = plansQuery.data ?? []
    return {
      plans: plans.length,
      activePlans: plans.filter((p) => p.isActive).length,
      variants: plans.reduce((acc, p) => acc + p._count.variants, 0),
    }
  }, [plansQuery.data])

  if (plansQuery.isPending) {
    return (
      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardContent className="flex min-h-72 items-center justify-center gap-3 text-muted-foreground">
          <RiLoader4Line className="size-5 animate-spin" />
          Loading subscription plans…
        </CardContent>
      </Card>
    )
  }

  if (plansQuery.isError) {
    return (
      <Card className="panel-glow border border-destructive/30 bg-destructive/10">
        <CardHeader>
          <CardTitle>Failed to load subscription plans</CardTitle>
          <CardDescription>
            Could not reach the backend admin contract.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => plansQuery.refetch()}>
            <RiRefreshLine data-icon="inline-start" className="size-4" />
            Retry request
          </Button>
        </CardContent>
      </Card>
    )
  }

  const plans = plansQuery.data

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="panel-glow border border-border/70 bg-background/72">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Subscription inventory</CardTitle>
                <CardDescription className="mt-1">
                  Click a plan to manage variants and subscribers.
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setCreatePlanOpen(true)}>
                <RiAddLine data-icon="inline-start" className="size-4" />
                New plan
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <MetricChip label="plans" value={String(totals.plans)} />
            <MetricChip
              label="active"
              value={String(totals.activePlans)}
              tone="accent"
            />
            <MetricChip
              label="variants"
              value={String(totals.variants)}
              tone="primary"
            />
          </CardContent>
        </Card>

        <Card className="panel-glow border border-border/70 bg-background/72">
          <CardHeader>
            <CardTitle>Operator notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Select a plan to view detail, manage variants, and see subscriber
              counts. Variant versioning is handled automatically when you
              change price or limits on a subscribed variant.
            </p>
            <Button variant="outline" onClick={() => plansQuery.refetch()}>
              <RiRefreshLine data-icon="inline-start" className="size-4" />
              Refresh
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </section>

      {plans.length === 0 && (
        <Card className="panel-glow border border-border/70 bg-background/72">
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <RiStackLine className="size-10 text-muted-foreground" />
            <div>
              <div className="font-heading text-xl text-card-foreground">
                No plans returned yet
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The admin contract is reachable, but there are no subscription
                plans in the response.
              </p>
            </div>
            <Button onClick={() => setCreatePlanOpen(true)}>
              <RiAddLine data-icon="inline-start" className="size-4" />
              Create first plan
            </Button>
          </CardContent>
        </Card>
      )}

      <PlanFormDialog open={createPlanOpen} onOpenChange={setCreatePlanOpen} />
    </div>
  )
}

type PlanCardProps = {
  plan: SubscriptionPlan
}

const PlanCard = ({ plan }: PlanCardProps) => (
  <Link to={`/plans/${plan.id}`} className="block">
    <Card className="panel-glow cursor-pointer border border-border/70 bg-background/72 transition-colors hover:border-primary/30">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{plan.name}</CardTitle>
            <CardDescription className="mt-1">
              Tier {plan.tierLevel} · code {plan.code} ·{" "}
              {plan.isActive ? "active" : "inactive"}
            </CardDescription>
          </div>
          <RiArrowRightLine className="size-5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm leading-6 text-muted-foreground">
            {plan.description ?? "No marketing description set."}
          </p>
          <div className="rounded-2xl border border-border/70 bg-card px-3 py-2 text-right">
            <div className="signal-text">variants</div>
            <div className="mt-2 font-heading text-xl text-card-foreground">
              {plan._count.variants}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(plan.features ?? []).slice(0, 3).map((f) => (
            <span
              key={f}
              className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-foreground"
            >
              {f}
            </span>
          ))}
          {(plan.features ?? []).length > 3 && (
            <span className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
              +{(plan.features ?? []).length - 3} more
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  </Link>
)

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
    <div className="mt-3 font-heading text-3xl text-card-foreground">
      {value}
    </div>
  </div>
)
