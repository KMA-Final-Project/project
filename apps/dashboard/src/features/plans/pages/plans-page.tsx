import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  RiAddLine,
  RiDeleteBin6Line,
  RiEditLine,
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
import { ConfirmDialog } from "@/features/plans/components/confirm-dialog.tsx"
import { PlanFormDialog } from "@/features/plans/components/plan-form-dialog.tsx"
import { VariantFormDialog } from "@/features/plans/components/variant-form-dialog.tsx"
import { deletePlan, deleteVariant } from "@/features/plans/plans-api.ts"
import { plansKeys, plansListQuery } from "@/features/plans/plans-queries.ts"
import type { PlanVariant, SubscriptionPlan } from "@/features/plans/types.ts"

// ===== Page =====

export const PlansPage = () => {
  const queryClient = useQueryClient()
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

  const invalidatePlans = () =>
    queryClient.invalidateQueries({ queryKey: plansKeys.all })

  return (
    <div className="space-y-6">
      {/* Header metrics */}
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="panel-glow border border-border/70 bg-background/72">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Subscription inventory</CardTitle>
                <CardDescription className="mt-1">
                  Live data from GET /admin/plans
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
              Variant price or limit changes on subscribed variants create a new
              version — the old variant is deactivated. Existing subscribers
              keep their original snapshot limits.
            </p>
            <Button variant="outline" onClick={() => plansQuery.refetch()}>
              <RiRefreshLine data-icon="inline-start" className="size-4" />
              Refresh
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Plan cards */}
      <section className="grid gap-4 xl:grid-cols-2">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onMutationSuccess={invalidatePlans}
          />
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

// ===== Plan Card =====

type PlanCardProps = {
  plan: SubscriptionPlan
  onMutationSuccess: () => void
}

const PlanCard = ({ plan, onMutationSuccess }: PlanCardProps) => {
  const [editOpen, setEditOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [addVariantOpen, setAddVariantOpen] = useState(false)

  const deactivateMutation = useMutation({
    mutationFn: () => deletePlan(plan.id),
    onSuccess: onMutationSuccess,
  })

  return (
    <Card className="panel-glow border border-border/70 bg-background/72">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{plan.name}</CardTitle>
            <CardDescription className="mt-1">
              Tier {plan.tierLevel} · code {plan.code} ·{" "}
              {plan.isActive ? "active" : "inactive"}
            </CardDescription>
          </div>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setEditOpen(true)}
            >
              <RiEditLine className="size-3.5" />
            </Button>
            {plan.isActive && (
              <Button
                variant="outline"
                size="icon"
                className="size-8 border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => setDeactivateOpen(true)}
              >
                <RiDeleteBin6Line className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
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

        <div className="flex flex-wrap gap-2">
          {(plan.features ?? []).map((f) => (
            <span
              key={f}
              className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-foreground"
            >
              {f}
            </span>
          ))}
          {(plan.features ?? []).length === 0 && (
            <span className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
              No features configured
            </span>
          )}
        </div>

        <div className="grid gap-3">
          {plan.variants.map((v) => (
            <VariantRow
              key={v.id}
              variant={v}
              planId={plan.id}
              onMutationSuccess={onMutationSuccess}
            />
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setAddVariantOpen(true)}
        >
          <RiAddLine data-icon="inline-start" className="size-4" />
          Add variant
        </Button>
      </CardContent>

      <PlanFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        plan={plan}
      />
      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Deactivate plan?"
        description={`"${plan.name}" and all its variants will be deactivated. This requires no active subscribers on any variant.`}
        confirmLabel="Deactivate"
        variant="destructive"
        isPending={deactivateMutation.isPending}
        onConfirm={() => deactivateMutation.mutate()}
      />
      <VariantFormDialog
        open={addVariantOpen}
        onOpenChange={setAddVariantOpen}
        planId={plan.id}
      />
    </Card>
  )
}

// ===== Variant Row =====

type VariantRowProps = {
  variant: PlanVariant
  planId: string
  onMutationSuccess: () => void
}

const VariantRow = ({ variant, planId, onMutationSuccess }: VariantRowProps) => {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => deleteVariant(variant.id),
    onSuccess: onMutationSuccess,
  })

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

        <div className="flex items-center gap-2 lg:flex-col lg:items-end">
          <div className="text-left lg:text-right">
            <div className="signal-text">price</div>
            <div className="mt-1 font-heading text-lg text-card-foreground">
              {formatPrice(variant.price, variant.currency)}
            </div>
            <div className="mt-1 text-xs tracking-[0.2em] text-muted-foreground uppercase">
              {variant.isActive ? "active" : "inactive"}
            </div>
          </div>
          <div className="flex gap-1 lg:mt-1">
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => setEditOpen(true)}
            >
              <RiEditLine className="size-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7 border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              <RiDeleteBin6Line className="size-3" />
            </Button>
          </div>
        </div>
      </div>

      <VariantFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        planId={planId}
        variant={variant}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete variant?"
        description={
          (variant._count?.subscriptions ?? 0) > 0
            ? `This variant has ${variant._count!.subscriptions} subscriber(s). It will be deactivated instead of deleted.`
            : `"${variant.name}" will be permanently deleted.`
        }
        confirmLabel={
          (variant._count?.subscriptions ?? 0) > 0 ? "Deactivate" : "Delete"
        }
        variant="destructive"
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}

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

const formatBillingCycle = (cycle: PlanVariant["billingCycleType"]) =>
  cycle.toLowerCase().replace(/_/g, " ")

const formatDuration = (seconds: number) => {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 60)}m`
}

const formatPrice = (rawPrice: string, currency: string) => {
  const price = Number(rawPrice)
  if (Number.isNaN(price)) return `${rawPrice} ${currency}`
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(price)
}
