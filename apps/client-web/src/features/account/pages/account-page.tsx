import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/features/auth/auth-provider.tsx"
import { subscriptionStatusQuery } from "../account-queries.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Separator } from "@/components/ui/separator.tsx"

export function AccountPage() {
  const { t } = useTranslation("account")
  const { session } = useAuth()
  const subQuery = useQuery(subscriptionStatusQuery())

  const user = session?.user
  const plan = subQuery.data?.currentPlan

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("profile.title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("profile.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("profile.name")}</span>
            <span className="font-medium">{user?.fullName ?? "—"}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("profile.email")}</span>
            <span className="font-medium">{user?.email ?? "—"}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("profile.role")}</span>
            <Badge variant="secondary">{user?.role ?? "—"}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("subscription.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {t("subscription.currentPlan")}
            </span>
            <span className="font-medium">
              {plan?.planName ?? t("subscription.noPlan")}
            </span>
          </div>
          {plan && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("subscription.status")}
                </span>
                <Badge
                  variant={
                    plan.status === "ACTIVE" ? "default" : "destructive"
                  }
                >
                  {plan.status}
                </Badge>
              </div>
            </>
          )}
          <div className="pt-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/account/subscription">
                {t("subscription.manage")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
