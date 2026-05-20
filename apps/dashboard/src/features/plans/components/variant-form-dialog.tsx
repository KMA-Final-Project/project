import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { RiErrorWarningLine } from "@remixicon/react"

import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Label } from "@/components/ui/label.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { createVariant, updateVariant } from "@/features/plans/plans-api.ts"
import { plansKeys } from "@/features/plans/plans-queries.ts"
import type {
  PlanVariant,
  BillingCycleType,
  CreateVariantPayload,
  UpdateVariantPayload,
} from "@/features/plans/types.ts"

type VariantFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  planId: string
  /** Pass an existing variant to edit. Omit for create mode. */
  variant?: PlanVariant
}

type FormValues = {
  name: string
  price: string
  currency: string
  billingCycleType: BillingCycleType
  maxDurationPerFile: string
  monthlyQuotaSeconds: string
}

const BILLING_CYCLES: { value: BillingCycleType; label: string }[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "SIX_MONTHS", label: "Six months" },
  { value: "YEARLY", label: "Yearly" },
  { value: "LIFETIME", label: "Lifetime" },
]

export const VariantFormDialog = ({
  open,
  onOpenChange,
  planId,
  variant,
}: VariantFormDialogProps) => {
  const isEdit = !!variant
  const hasSubscribers = (variant?._count?.subscriptions ?? 0) > 0
  const queryClient = useQueryClient()
  const [billingCycle, setBillingCycle] = useState<BillingCycleType>(
    variant?.billingCycleType ?? "MONTHLY",
  )
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: {
      name: variant?.name ?? "",
      price: variant?.price ?? "0",
      currency: variant?.currency ?? "VND",
      maxDurationPerFile: String(variant?.maxDurationPerFile ?? 3600),
      monthlyQuotaSeconds: String(variant?.monthlyQuotaSeconds ?? 72000),
    },
  })

  useEffect(() => {
    if (!open) return
    reset({
      name: variant?.name ?? "",
      price: variant?.price ?? "0",
      currency: variant?.currency ?? "VND",
      maxDurationPerFile: String(variant?.maxDurationPerFile ?? 3600),
      monthlyQuotaSeconds: String(variant?.monthlyQuotaSeconds ?? 72000),
    })
    const timer = setTimeout(() => {
      setBillingCycle(variant?.billingCycleType ?? "MONTHLY")
      setError(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [open, variant, reset])

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (isEdit) {
        const dto: UpdateVariantPayload = {
          name: values.name,
          price: Number(values.price),
          currency: values.currency,
          maxDurationPerFile: Number(values.maxDurationPerFile),
          monthlyQuotaSeconds: Number(values.monthlyQuotaSeconds),
        }
        return updateVariant(variant!.id, dto)
      }
      const dto: CreateVariantPayload = {
        name: values.name,
        price: Number(values.price),
        currency: values.currency,
        billingCycleType: billingCycle,
        maxDurationPerFile: Number(values.maxDurationPerFile),
        monthlyQuotaSeconds: Number(values.monthlyQuotaSeconds),
      }
      return createVariant(planId, dto)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: plansKeys.all })
      onOpenChange(false)
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit variant" : "Add variant"}
          </DialogTitle>
        </DialogHeader>

        {isEdit && hasSubscribers && (
          <div className="flex items-start gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-300">
            <RiErrorWarningLine className="mt-0.5 size-4 shrink-0" />
            <p>
              This variant has active subscribers. Changing the price or limits
              will create a new variant version and deactivate this one.
              Existing subscribers keep their current snapshot.
            </p>
          </div>
        )}

        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="variant-name">Name</Label>
            <Input
              id="variant-name"
              placeholder="Monthly"
              {...register("name", { required: true })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="variant-price">Price</Label>
              <Input
                id="variant-price"
                type="number"
                min={0}
                placeholder="99000"
                {...register("price", { required: true, min: 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="variant-currency">Currency</Label>
              <Input
                id="variant-currency"
                placeholder="VND"
                {...register("currency")}
              />
            </div>
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Billing cycle</Label>
              <Select
                value={billingCycle}
                onValueChange={(v) => setBillingCycle(v as BillingCycleType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_CYCLES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="variant-max-duration">Max duration / file (s)</Label>
              <Input
                id="variant-max-duration"
                type="number"
                min={60}
                {...register("maxDurationPerFile", {
                  required: true,
                  min: 60,
                  valueAsNumber: true,
                })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="variant-monthly-quota">Monthly quota (s)</Label>
              <Input
                id="variant-monthly-quota"
                type="number"
                min={0}
                {...register("monthlyQuotaSeconds", {
                  required: true,
                  min: 0,
                  valueAsNumber: true,
                })}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Add variant"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
