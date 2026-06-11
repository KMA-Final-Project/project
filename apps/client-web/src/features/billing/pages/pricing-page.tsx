import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { RiCheckLine, RiStarLine } from "@remixicon/react"
import { useAuth } from "@/features/auth/auth-provider.tsx"
import { authIntent } from "@/features/auth/auth-intent.ts"
import { billingCatalogQuery, billingStatusQuery } from "../billing-queries.ts"
import { subscriptionStatusQuery } from "@/features/account/account-queries.ts"
import { createCheckoutSession } from "../billing-api.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx"
import { ReturnToApp } from "@/shared/components/return-to-app"
import type { BillingCatalogItem } from "@kapter/contracts"

type PlanGroup = {
  planCode: string
  planName: string
  variants: BillingCatalogItem[]
  isFree?: boolean
}

const FREE_PLAN: PlanGroup = {
  planCode: "free",
  planName: "Free",
  isFree: true,
  variants: [
    {
      planCode: "free",
      planName: "Free",
      variantId: "FREE_MONTHLY",
      variantName: "Free Forever",
      price: "0",
      currency: "USD",
      billingCycleType: "MONTHLY",
      monthlyQuotaSeconds: 1800,
      maxDurationPerFile: 300,
      aiCreditsPerMonth: 10,
    },
  ],
}

const formatQuota = (seconds: number | null): string => {
  if (!seconds) return "0 minutes"
  if (seconds >= 3600) {
    const hours = seconds / 3600
    return `${hours} hour${hours > 1 ? "s" : ""}`
  }
  const minutes = Math.floor(seconds / 60)
  return `${minutes} minute${minutes > 1 ? "s" : ""}`
}

export function PricingPage() {
  const { t } = useTranslation("billing")
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)

  // Read variant from URL (from checkout intent after auth)
  const intentVariantId = searchParams.get("variant") ?? ""

  useEffect(() => {
    if (checkoutUrl) {
      window.location.assign(checkoutUrl)
    }
  }, [checkoutUrl])

  const catalogQuery = useQuery(billingCatalogQuery())
  const statusQuery = useQuery({
    ...billingStatusQuery(),
    enabled: isAuthenticated,
  })
  const subStatusQuery = useQuery({
    ...subscriptionStatusQuery(),
    enabled: isAuthenticated,
  })

  const currentPlanCode =
    subStatusQuery.data?.currentPlan?.planCode?.toLowerCase() ?? null
  const currentVariantId =
    subStatusQuery.data?.currentPlan?.variantId ?? null

  const planGroups = useMemo<PlanGroup[]>(() => {
    const catalogItems = catalogQuery.data ?? []
    const grouped = new Map<string, BillingCatalogItem[]>()
    for (const item of catalogItems) {
      const existing = grouped.get(item.planCode) ?? []
      existing.push(item)
      grouped.set(item.planCode, existing)
    }
    const cycleOrder: Record<string, number> = {
      MONTHLY: 0,
      SIX_MONTHS: 1,
      YEARLY: 2,
    }
    const paidGroups = Array.from(grouped.entries()).map(
      ([planCode, variants]) => ({
        planCode,
        planName: variants[0].planName,
        variants: [...variants].sort(
          (a, b) =>
            (cycleOrder[a.billingCycleType] ?? 99) -
            (cycleOrder[b.billingCycleType] ?? 99),
        ),
      }),
    )
    return [FREE_PLAN, ...paidGroups]
  }, [catalogQuery.data])

  const [selectedCycles, setSelectedCycles] = useState<
    Record<string, string>
  >(() => {
    // Pre-select variant from checkout intent
    if (intentVariantId) {
      return { _intent: intentVariantId } as Record<string, string>
    }
    return {}
  })

  const getSelectedVariant = (group: PlanGroup): BillingCatalogItem => {
    const selected = selectedCycles[group.planCode]
    // Check if intent variant belongs to this group
    if (!selected && intentVariantId) {
      const intentVariant = group.variants.find(
        (v) => v.variantId === intentVariantId,
      )
      if (intentVariant) return intentVariant
    }
    return (
      group.variants.find((v) => v.variantId === selected) ?? group.variants[0]
    )
  }

  const handleCta = async (group: PlanGroup) => {
    const variant = getSelectedVariant(group)
    if (group.isFree) return

    if (!isAuthenticated) {
      authIntent.set({ type: "checkout", variantId: variant.variantId })
      navigate("/signup")
      return
    }

    if (statusQuery.data?.hasActivePaidSubscription) {
      navigate("/account/subscription")
      return
    }

    const origin = window.location.origin
    const mobileSuffix = searchParams.get("fromMobile") === "1" ? "?fromMobile=1" : ""
    const result = await createCheckoutSession(
      variant.variantId,
      `${origin}/billing/success${mobileSuffix}`,
      `${origin}/billing/cancel${mobileSuffix}`,
    )
    sessionStorage.setItem("pendingCheckoutSessionId", result.sessionId)
    setCheckoutUrl(result.checkoutUrl)
  }

  const getCtaLabel = (group: PlanGroup): string => {
    if (group.isFree) return t("pricing.free")
    const variant = getSelectedVariant(group)
    if (currentVariantId === variant.variantId) return t("pricing.currentPlan")
    return t("pricing.upgrade")
  }

  const isCtaDisabled = (group: PlanGroup): boolean => {
    if (group.isFree) return true
    const variant = getSelectedVariant(group)
    return currentVariantId === variant.variantId
  }

  const isCurrentPlan = (group: PlanGroup): boolean => {
    if (group.isFree && currentPlanCode === "free") return true
    if (group.isFree) return false
    const variant = getSelectedVariant(group)
    return currentVariantId === variant.variantId
  }

  if (catalogQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 size-96 rounded-full bg-primary/5 blur-[100px] pointer-events-none" />
        <h1 className="mb-12 text-center font-heading text-4xl font-extrabold tracking-tight text-foreground">
          {t("pricing.title")}
        </h1>
        <div className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-4">
                <div className="h-6 w-24 rounded bg-muted" />
                <div className="h-10 w-32 rounded bg-muted" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-4 w-full rounded bg-muted" />
                <div className="h-4 w-5/6 rounded bg-muted" />
                <div className="h-4 w-4/5 rounded bg-muted" />
              </CardContent>
              <CardFooter>
                <div className="h-10 w-full rounded bg-muted" />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-20 relative overflow-hidden">
      {/* Background decoration blurs */}
      <div className="absolute top-[10%] left-[-10%] size-96 rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[-10%] size-96 rounded-full bg-secondary/10 blur-[100px] pointer-events-none" />

      <div className="text-center space-y-4 mb-16 relative z-10">
        <Badge
          variant="outline"
          className="border-primary/30 bg-primary/5 text-primary"
        >
          Simple Pricing
        </Badge>
        <h1 className="font-heading text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          {t("pricing.title")}
        </h1>
        <p className="text-muted-foreground max-w-md mx-auto text-sm sm:text-base">
          Choose a plan that fits your learning pace or content creation needs.
          Cancel or change plans anytime.
        </p>
        <ReturnToApp context="account" />
      </div>

      <div className="grid gap-8 md:grid-cols-3 items-stretch relative z-10">
        {planGroups.map((group) => {
          const variant = getSelectedVariant(group)
          const hasMultipleVariants = group.variants.length > 1
          const isCurrent = isCurrentPlan(group)
          const isPro = group.planCode.toUpperCase() === "PRO"

          return (
            <Card
              key={group.planCode}
              className={`flex flex-col justify-between transition-all duration-300 hover:-translate-y-2 hover:shadow-xl ${
                isCurrent
                  ? "ring-2 ring-primary border-primary/20 shadow-md shadow-primary/5"
                  : isPro
                    ? "border-primary/40 bg-card/90 dark:bg-card/75 shadow-lg relative after:absolute after:inset-0 after:rounded-2xl after:border-2 after:border-primary/20 after:pointer-events-none"
                    : "border-border/60"
              }`}
            >
              <div>
                <CardHeader className="space-y-4 pb-4">
                  {isPro && (
                    <div className="absolute top-4 right-4">
                      <Badge
                        variant="default"
                        className="bg-primary hover:bg-primary/95 text-white flex items-center gap-1 text-[10px] px-2.5 py-0.5"
                      >
                        <RiStarLine className="size-3 fill-white" />
                        Most Popular
                      </Badge>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-bold font-heading">
                      {group.planName}
                    </CardTitle>
                    {isCurrent && (
                      <Badge
                        variant="outline"
                        className="border-primary/50 text-primary bg-primary/5"
                      >
                        {t("pricing.currentPlan")}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-4xl sm:text-5xl font-extrabold font-heading tracking-tight text-foreground">
                      {group.isFree ? t("pricing.free") : `$${variant.price}`}
                    </span>
                    {!group.isFree && (
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {variant.billingCycleType.toLowerCase() === "monthly"
                          ? t("pricing.perMonth")
                          : t("pricing.perYear")}
                      </span>
                    )}
                  </div>

                  {hasMultipleVariants && (
                    <div className="pt-2">
                      <Tabs
                        value={variant.variantId}
                        onValueChange={(value) =>
                          setSelectedCycles((prev) => ({
                            ...prev,
                            [group.planCode]: value,
                          }))
                        }
                        className="w-full"
                      >
                        <TabsList className="grid grid-cols-2 bg-muted/60 p-0.5 h-8">
                          {group.variants.map((v) => (
                            <TabsTrigger
                              key={v.variantId}
                              value={v.variantId}
                              className="text-xs h-7 data-[state=active]:bg-card data-[state=active]:shadow-sm"
                            >
                              {v.billingCycleType.toLowerCase() === "monthly"
                                ? t("pricing.monthly")
                                : t("pricing.yearly")}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </Tabs>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="py-6 border-t border-border/20">
                  <ul className="space-y-3">
                    <li className="flex items-start gap-2.5">
                      <div className="rounded-full bg-emerald-500/10 p-0.5 mt-0.5 text-emerald-500">
                        <RiCheckLine className="size-4" />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        <strong className="text-foreground">
                          {formatQuota(variant.monthlyQuotaSeconds)}
                        </strong>{" "}
                        of speech translation
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <div className="rounded-full bg-emerald-500/10 p-0.5 mt-0.5 text-emerald-500">
                        <RiCheckLine className="size-4" />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        <strong className="text-foreground">
                          {formatQuota(variant.maxDurationPerFile)}
                        </strong>{" "}
                        limit per media file
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <div className="rounded-full bg-emerald-500/10 p-0.5 mt-0.5 text-emerald-500">
                        <RiCheckLine className="size-4" />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        <strong className="text-foreground">
                          {variant.aiCreditsPerMonth.toLocaleString()}
                        </strong>{" "}
                        monthly AI credits
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <div className="rounded-full bg-emerald-500/10 p-0.5 mt-0.5 text-emerald-500">
                        <RiCheckLine className="size-4" />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Word-level timing and karaoke highlights
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <div className="rounded-full bg-emerald-500/10 p-0.5 mt-0.5 text-emerald-500">
                        <RiCheckLine className="size-4" />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Side-by-side bilingual subtitle tracks
                      </span>
                    </li>
                  </ul>
                </CardContent>
              </div>

              <CardFooter className="pt-4 pb-6 border-t border-border/20">
                <Button
                  className={`w-full h-10 transition-all font-semibold ${
                    isCurrent
                      ? "border-primary text-primary hover:bg-primary/5"
                      : isPro
                        ? "bg-primary text-white hover:bg-primary/95 shadow-md shadow-primary/10 hover:scale-102"
                        : "hover:scale-102"
                  }`}
                  variant={
                    isCurrent ? "outline" : isPro ? "default" : "secondary"
                  }
                  disabled={isCtaDisabled(group)}
                  onClick={() => handleCta(group)}
                >
                  {getCtaLabel(group)}
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
