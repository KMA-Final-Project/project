import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { RiCloseCircleLine } from "@remixicon/react"
import { Button } from "@/components/ui/button.tsx"

export function BillingCancelPage() {
  const { t } = useTranslation("billing")

  sessionStorage.removeItem("pendingCheckoutSessionId")

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="mx-auto max-w-lg text-center space-y-8">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-muted">
          <RiCloseCircleLine className="size-10 text-muted-foreground" />
        </div>
        <div className="space-y-3">
          <h1 className="font-heading text-3xl font-bold text-foreground">
            {t("cancel.title")}
          </h1>
          <p className="text-muted-foreground text-base">
            {t("cancel.description")}
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button asChild>
            <Link to="/pricing">{t("cancel.backToPricing")}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/account">Go to account</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
