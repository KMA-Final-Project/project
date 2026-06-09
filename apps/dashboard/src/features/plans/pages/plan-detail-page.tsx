import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useParams } from "react-router"
import {
  RiAddLine,
  RiArrowLeftLine,
  RiDeleteBin6Line,
  RiEditLine,
  RiGroupLine,
  RiLoader4Line,
} from "@remixicon/react"

import { Badge } from "@/components/ui/badge.tsx"
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
import { plansKeys, planDetailQuery } from "@/features/plans/plans-queries.ts"
import type { AdminPlanVariantDetail } from "@/features/plans/types.ts"

export const PlanDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const planQuery = useQuery(planDetailQuery(id!))
  const [editOpen, setEditOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [addVariantOpen, setAddVariantOpen] = useState(false)

  const deactivateMutation = useMutation({
    mutationFn: () => deletePlan(id!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: plansKeys.all }),
  })

  if (planQuery.isPending) {
    return (
      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardContent className="flex min-h-72 items-center justify-center gap-3 text-muted-foreground">
          <RiLoader4Line className="size-5 animate-spin" />
          Loading plan...
        </CardContent>
      </Card>
    )
  }

  if (planQuery.isError) {
    return (
      <Card className="panel-glow border border-destructive/30 bg-destructive/10">
        <CardHeader>
          <CardTitle>Failed to load plan</CardTitle>
        </CardHeader>
        <CardContent>
          <Link to="/plans">
            <Button variant="outline">Back to plans</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  const plan = planQuery.data
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: plansKeys.all })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/plans">
          <Button variant="outline" size="sm">
            <RiArrowLeftLine data-icon="inline-start" className="size-4" />
            Plans
          </Button>
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium text-card-foreground">
          {plan.name}
        </span>
      </div>

      <Card className="panel-glow border border-border/70 bg-background/72">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <Badge variant={plan.isActive ? "default" : "secondary"}>
                  {plan.isActive ? "active" : "inactive"}
                </Badge>
              </div>
              <CardDescription className="mt-1">
                Tier {plan.tierLevel} · code {plan.code}
              </CardDescription>
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                <RiEditLine data-icon="inline-start" className="size-3.5" />
                Edit plan
              </Button>
              {plan.isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/30 text-destructive"
                  onClick={() => setDeactivateOpen(true)}
                >
                  <RiDeleteBin6Line
                    data-icon="inline-start"
                    className="size-3.5"
                  />
                  Deactivate
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {plan.description ?? "No description."}
          </p>
          <div className="flex flex-wrap gap-2">
            {(plan.features ?? []).map((f) => (
              <span
                key={f}
                className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-foreground"
              >
                {f}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricChip label="total variants" value={String(plan.totalVariants)} />
        <MetricChip
          label="active variants"
          value={String(plan.activeVariants)}
          tone="accent"
        />
        <MetricChip
          label="active subscribers"
          value={String(plan.activeCurrentSubscribers)}
          tone="primary"
        />
        <MetricChip
          label="historical subscriptions"
          value={String(plan.historicalSubscriptions)}
        />
      </div>

      <div className="flex items-center justify-between">
        <Link to={`/users?planId=${plan.id}`}>
          <Button variant="outline" size="sm">
            <RiGroupLine data-icon="inline-start" className="size-4" />
            View subscribers
          </Button>
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddVariantOpen(true)}
        >
          <RiAddLine data-icon="inline-start" className="size-4" />
          Add variant
        </Button>
      </div>

      <div className="space-y-4">
        {plan.variants.map((v) => (
          <VariantDetailCard
            key={v.id}
            variant={v}
            planId={plan.id}
            onMutationSuccess={invalidate}
          />
        ))}
      </div>

      <PlanFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        plan={plan as never}
      />
      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Deactivate plan?"
        description={`"${plan.name}" and all its variants will be deactivated.`}
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
    </div>
  )
}

type VariantDetailCardProps = {
  variant: AdminPlanVariantDetail
  planId: string
  onMutationSuccess: () => void
}

const VariantDetailCard = ({
  variant,
  planId,
  onMutationSuccess,
}: VariantDetailCardProps) => {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => deleteVariant(variant.id),
    onSuccess: onMutationSuccess,
  })

  const m = variant.subscriptionMetrics

  return (
    <div
      className={`rounded-3xl border px-4 py-4 ${
        variant.isActive
          ? "border-border/70 bg-card"
          : "border-border/40 bg-card/50"
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-card-foreground">
              {variant.name}
            </span>
            <Badge
              variant={variant.isActive ? "default" : "secondary"}
              className="text-xs"
            >
              {variant.isActive ? "active" : "inactive"}
            </Badge>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {variant.billingCycleType.toLowerCase().replace(/_/g, " ")} · max
            file {formatDuration(variant.maxDurationPerFile)} · monthly quota{" "}
            {formatDuration(variant.monthlyQuotaSeconds)} · AI credits{" "}
            {variant.aiCreditsPerMonth}
          </div>
          <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
            <span>
              Active:{" "}
              <strong className="text-card-foreground">
                {m.activeCurrentSubscribers}
              </strong>
            </span>
            <span>
              Historical:{" "}
              <strong className="text-card-foreground">
                {m.historicalSubscriptions}
              </strong>
            </span>
            <Link
              to={`/users?variantId=${variant.id}`}
              className="text-primary hover:underline"
            >
              View subscribers
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2 lg:flex-col lg:items-end">
          <div className="text-left lg:text-right">
            <div className="signal-text">price</div>
            <div className="mt-1 font-heading text-lg text-card-foreground">
              {formatPrice(variant.price, variant.currency)}
            </div>
          </div>
          <div className="flex gap-1">
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
              className="size-7 border-destructive/30 text-destructive"
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
        variant={variant as never}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete variant?"
        description={
          m.historicalSubscriptions > 0
            ? `This variant has ${m.historicalSubscriptions} subscription record(s). It will be deactivated instead of deleted.`
            : `"${variant.name}" will be permanently deleted.`
        }
        confirmLabel={m.historicalSubscriptions > 0 ? "Deactivate" : "Delete"}
        variant="destructive"
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}

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
