import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { subscriptionStatusQuery, billingStatusQuery } from "../account-queries.ts"
import { createPortalSession } from "@/features/billing/billing-api.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { ReturnToApp } from "@/shared/components/return-to-app"

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function SubscriptionPage() {
  const { t } = useTranslation("account")
  const subQuery = useQuery(subscriptionStatusQuery())
  const billingQuery = useQuery(billingStatusQuery())

  const plan = subQuery.data?.currentPlan
  const quota = subQuery.data?.quota
  const aiCredits = subQuery.data?.aiCredits
  const billing = billingQuery.data?.currentSubscription

  const billingState = billing?.stripeStatus ?? (plan ? "active" : "inactive")
  const isCancelAtPeriodEnd = billing?.cancelAtPeriodEnd ?? false

  const handleManage = async () => {
    const origin = window.location.origin
    const result = await createPortalSession(`${origin}/account/subscription`)
    window.location.assign(result.url)
  }

  const quotaPercent =
    quota && quota.totalSeconds && quota.totalSeconds > 0
      ? Math.round((quota.usedSeconds / quota.totalSeconds) * 100)
      : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("subscription.title")}</h1>
        <ReturnToApp context="account" />
      </div>

      {isCancelAtPeriodEnd && (
        <div className="rounded-lg border border-yellow-500 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-400 dark:bg-yellow-950 dark:text-yellow-200">
          {t("subscription.cancelWarning")}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("subscription.currentPlan")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {t("subscription.currentPlan")}
            </span>
            <span className="font-medium">
              {plan?.planName ?? t("subscription.free")}
            </span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {t("subscription.status")}
            </span>
            <Badge
              variant={
                billingState === "active" ? "default" : "destructive"
              }
            >
              {t(`subscription.state.${billingState}`, billingState)}
            </Badge>
          </div>
          {billing?.currentPeriodEnd && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("subscription.period")}
                </span>
                <span className="font-medium">
                  {new Date(billing.currentPeriodEnd).toLocaleDateString()}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("subscription.aiCredits")}</CardTitle>
          </CardHeader>
          <CardContent>
            {aiCredits ? (
              <p className="text-2xl font-bold">
                {t("subscription.creditsRemaining", {
                  remaining: aiCredits.remaining,
                  included: aiCredits.includedPerCycle,
                })}
              </p>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("subscription.quota")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quota ? (
              <>
                <p className="text-sm font-medium">
                  {t("subscription.quotaUsed", {
                    used: formatSeconds(quota.usedSeconds),
                    total:
                      quota.totalSeconds !== null
                        ? formatSeconds(quota.totalSeconds)
                        : t("subscription.unlimited"),
                  })}
                </p>
                {quotaPercent !== null && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(quotaPercent, 100)}%` }}
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        {billingQuery.data?.hasStripeCustomer && (
          <Button onClick={handleManage}>
            {t("subscription.manage")}
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to="/pricing">{t("subscription.upgrade")}</Link>
        </Button>
      </div>
    </div>
  )
}
