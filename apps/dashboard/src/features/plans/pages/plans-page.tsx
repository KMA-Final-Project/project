import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  RiLoader4Line,
  RiRefreshLine,
  RiSparkling2Line,
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
import { plansListQuery } from "@/features/plans/plans-queries.ts"
import type { PlanVariant, SubscriptionPlan } from "@/features/plans/types.ts"

export const PlansPage = () => {
  const plansQuery = useQuery(plansListQuery())

  const totals = useMemo(() => {
    const plans = plansQuery.data ?? []

    return {
      plans: plans.length,
      activePlans: plans.filter((plan) => plan.isActive).length,
      variants: plans.reduce((count, plan) => count + plan._count.variants, 0),
    }
  }, [plansQuery.data])

  if (plansQuery.isPending) {
    return (
      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardContent className="flex min-h-72 items-center justify-center gap-3 text-muted-foreground">
          <RiLoader4Line className="size-5 animate-spin" />
          Loading subscription plans...
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
            The backend contract exists, but this session could not fetch the
            live inventory.
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
            <CardTitle>Live subscription inventory</CardTitle>
            <CardDescription>
              This page is now bound to the backend admin contract at GET
              /admin/plans.
            </CardDescription>
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
            <CardDescription>
              The next pass on this page should add create, edit, deactivate,
              and detail routes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Variant price and limit changes can create a new version instead
              of mutating the existing variant in place.
            </p>
            <p>
              That behavior already exists in the backend service, so the UI
              needs explicit versioning affordances in the next batch.
            </p>
            <Button variant="outline" onClick={() => plansQuery.refetch()}>
              <RiRefreshLine data-icon="inline-start" className="size-4" />
              Refresh inventory
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
          </CardContent>
        </Card>
      )}
    </div>
  )
}

type PlanCardProps = {
  plan: SubscriptionPlan
}

const PlanCard = ({ plan }: PlanCardProps) => {
  return (
    <Card className="panel-glow border border-border/70 bg-background/72">
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <CardDescription>
          Tier {plan.tierLevel} · code {plan.code} ·{" "}
          {plan.isActive ? "active" : "inactive"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm leading-6 text-muted-foreground">
            {plan.description ??
              "No marketing description set for this plan yet."}
          </p>
          <div className="rounded-2xl border border-border/70 bg-card px-3 py-2 text-right">
            <div className="signal-text">variants</div>
            <div className="mt-2 font-heading text-xl text-card-foreground">
              {plan._count.variants}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(plan.features ?? []).map((feature) => (
            <span
              key={feature}
              className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-foreground"
            >
              {feature}
            </span>
          ))}
          {(plan.features ?? []).length === 0 && (
            <span className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
              No marketing features configured
            </span>
          )}
        </div>

        <div className="grid gap-3">
          {plan.variants.map((variant) => (
            <VariantRow key={variant.id} variant={variant} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

type VariantRowProps = {
  variant: PlanVariant
}

const VariantRow = ({ variant }: VariantRowProps) => {
  return (
    <div className="rounded-3xl border border-border/70 bg-card px-4 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <RiSparkling2Line className="size-4 text-accent" />
            <span className="font-medium text-card-foreground">
              {variant.name}
            </span>
          </div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            {formatBillingCycle(variant.billingCycleType)} · max file{" "}
            {formatDuration(variant.maxDurationPerFile)} · monthly quota{" "}
            {formatDuration(variant.monthlyQuotaSeconds)}
          </div>
        </div>

        <div className="text-left lg:text-right">
          <div className="signal-text">price</div>
          <div className="mt-2 font-heading text-lg text-card-foreground">
            {formatPrice(variant.price, variant.currency)}
          </div>
          <div className="mt-2 text-xs tracking-[0.2em] text-muted-foreground uppercase">
            {variant.isActive ? "active" : "inactive"}
          </div>
        </div>
      </div>
    </div>
  )
}

type MetricChipProps = {
  label: string
  value: string
  tone?: "default" | "primary" | "accent"
}

const MetricChip = ({ label, value, tone = "default" }: MetricChipProps) => {
  return (
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
}

const formatBillingCycle = (cycle: PlanVariant["billingCycleType"]) => {
  return cycle.toLowerCase().replace(/_/g, " ")
}

const formatDuration = (seconds: number) => {
  if (seconds >= 3600) {
    return `${Math.round(seconds / 3600)}h`
  }

  return `${Math.round(seconds / 60)}m`
}

const formatPrice = (rawPrice: string, currency: string) => {
  const price = Number(rawPrice)

  if (Number.isNaN(price)) {
    return `${rawPrice} ${currency}`
  }

  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(price)
}
