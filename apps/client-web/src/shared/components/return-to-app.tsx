import { useSearchParams } from "react-router"
import { RiExternalLinkLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"

const MOBILE_RETURN_URL =
  import.meta.env.VITE_MOBILE_APP_RETURN_URL ?? "mobileapp://subscription"

type ReturnToAppProps = {
  context?: "checkout-success" | "checkout-cancel" | "account"
}

export function ReturnToApp({ context = "account" }: ReturnToAppProps) {
  const [searchParams] = useSearchParams()
  const fromMobile = searchParams.get("fromMobile") === "1"

  if (!fromMobile) return null

  const url = `${MOBILE_RETURN_URL}?refreshBilling=1&context=${context}`

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.location.assign(url)}
    >
      <RiExternalLinkLine data-icon="inline-start" className="size-4" />
      Return to app
    </Button>
  )
}
