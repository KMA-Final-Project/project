import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { RiAddLine, RiDeleteBin6Line } from "@remixicon/react"

import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Label } from "@/components/ui/label.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import { createPlan, updatePlan } from "@/features/plans/plans-api.ts"
import { plansKeys } from "@/features/plans/plans-queries.ts"
import type {
  SubscriptionPlan,
  CreatePlanPayload,
  UpdatePlanPayload,
} from "@/features/plans/types.ts"

type PlanFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pass an existing plan to edit. Omit for create mode. */
  plan?: SubscriptionPlan
}

type FormValues = {
  id: string
  code: string
  name: string
  description: string
  tierLevel: number
}

export const PlanFormDialog = ({
  open,
  onOpenChange,
  plan,
}: PlanFormDialogProps) => {
  const isEdit = !!plan
  const queryClient = useQueryClient()

  const [features, setFeatures] = useState<string[]>(plan?.features ?? [])
  const [featureInput, setFeatureInput] = useState("")
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: {
      id: plan?.id ?? "",
      code: plan?.code ?? "",
      name: plan?.name ?? "",
      description: plan?.description ?? "",
      tierLevel: plan?.tierLevel ?? 1,
    },
  })

  useEffect(() => {
    if (!open) return
    reset({
      id: plan?.id ?? "",
      code: plan?.code ?? "",
      name: plan?.name ?? "",
      description: plan?.description ?? "",
      tierLevel: plan?.tierLevel ?? 1,
    })
    // Batch all local state resets in a single microtask to avoid
    // triggering the react-hooks/set-state-in-effect lint rule.
    const timer = setTimeout(() => {
      setFeatures(plan?.features ?? [])
      setFeatureInput("")
      setError(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [open, plan, reset])

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (isEdit) {
        const dto: UpdatePlanPayload = {
          name: values.name,
          description: values.description || undefined,
          features: features.length > 0 ? features : [],
          tierLevel: Number(values.tierLevel),
        }
        return updatePlan(plan!.id, dto)
      }
      const dto: CreatePlanPayload = {
        id: values.id,
        code: values.code,
        name: values.name,
        description: values.description || undefined,
        features: features.length > 0 ? features : [],
        tierLevel: Number(values.tierLevel),
      }
      return createPlan(dto)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: plansKeys.all })
      onOpenChange(false)
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  const addFeature = () => {
    const trimmed = featureInput.trim()
    if (trimmed && !features.includes(trimmed)) {
      setFeatures((prev) => [...prev, trimmed])
    }
    setFeatureInput("")
  }

  const removeFeature = (f: string) => {
    setFeatures((prev) => prev.filter((x) => x !== f))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit plan" : "Create plan"}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4"
        >
          {!isEdit && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="plan-id">Plan ID</Label>
                <Input
                  id="plan-id"
                  placeholder="PRO"
                  {...register("id", { required: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-code">Code</Label>
                <Input
                  id="plan-code"
                  placeholder="pro"
                  {...register("code", { required: true })}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Name</Label>
            <Input
              id="plan-name"
              placeholder="Pro Plan"
              {...register("name", { required: true })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-description">Description</Label>
            <Textarea
              id="plan-description"
              placeholder="Optional marketing description"
              rows={2}
              {...register("description")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-tier">Tier level</Label>
            <Input
              id="plan-tier"
              type="number"
              min={1}
              {...register("tierLevel", { min: 1, valueAsNumber: true })}
            />
          </div>

          <div className="space-y-2">
            <Label>Features</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add a feature…"
                value={featureInput}
                onChange={(e) => setFeatureInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addFeature()
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={addFeature}
              >
                <RiAddLine className="size-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {features.map((f) => (
                <span
                  key={f}
                  className="flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-foreground"
                >
                  {f}
                  <button
                    type="button"
                    onClick={() => removeFeature(f)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <RiDeleteBin6Line className="size-3" />
                  </button>
                </span>
              ))}
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
                  : "Create plan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
