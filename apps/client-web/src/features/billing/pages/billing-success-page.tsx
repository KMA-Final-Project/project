import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiLoader4Line,
  RiTimeLine,
} from "@remixicon/react"
import { checkoutSessionQuery, billingKeys } from "../billing-queries.ts"
import { accountKeys } from "@/features/account/account-queries.ts"
import { Button } from "@/components/ui/button.tsx"

const POLL_INTERVAL = 3_000
const MAX_POLL_ATTEMPTS = 20 // 20 attempts × 3s = 60s max

export function BillingSuccessPage() {
  const { t } = useTranslation("billing")
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sessionId] = useState(() =>
    sessionStorage.getItem("pendingCheckoutSessionId") ?? "",
  )
  const [countdown, setCountdown] = useState(5)
  const pollCountRef = useRef(0)
  const [pollCount, setPollCount] = useState(0)

  const sessionQuery = useQuery({
    ...checkoutSessionQuery(sessionId),
    retry: false,
    refetchOnWindowFocus: false,
  })

  // Derive error state from query and poll count
  const pollError =
    sessionQuery.isError || pollCount >= MAX_POLL_ATTEMPTS

  // Poll until completed or error
  useEffect(() => {
    if (!sessionId) return
    if (sessionQuery.data?.status === "COMPLETED") {
      sessionStorage.removeItem("pendingCheckoutSessionId")
      queryClient.invalidateQueries({ queryKey: billingKeys.all })
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
      return
    }
    if (pollError) return

    const timer = setInterval(async () => {
      pollCountRef.current += 1
      setPollCount(pollCountRef.current)

      // Stop polling after max attempts
      if (pollCountRef.current >= MAX_POLL_ATTEMPTS) {
        clearInterval(timer)
        return
      }

      try {
        await queryClient.invalidateQueries({
          queryKey: billingKeys.session(sessionId),
        })
      } catch {
        // If invalidation itself fails, stop polling
        clearInterval(timer)
      }
    }, POLL_INTERVAL)

    return () => clearInterval(timer)
  }, [queryClient, sessionId, sessionQuery.data?.status, pollError])

  // Auto-redirect countdown after completion
  useEffect(() => {
    if (sessionQuery.data?.status !== "COMPLETED") return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          navigate("/account/subscription", { replace: true })
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [sessionQuery.data?.status, navigate])

  // No session ID — already processed or direct visit
  if (!sessionId) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="mx-auto max-w-lg text-center space-y-8">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-primary/10">
            <RiCheckboxCircleLine className="size-10 text-primary" />
          </div>
          <div className="space-y-3">
            <h1 className="font-heading text-3xl font-bold text-foreground">
              {t("success.title")}
            </h1>
            <p className="text-muted-foreground text-base">
              Your subscription is now active. Enjoy Kapter!
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button asChild>
              <Link to="/account/subscription">View subscription</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/pricing">Back to pricing</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const isCompleted = sessionQuery.data?.status === "COMPLETED"

  // Error state — polling failed or timed out
  if (pollError && !isCompleted) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="mx-auto max-w-lg text-center space-y-8">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-destructive/10">
            <RiErrorWarningLine className="size-10 text-destructive" />
          </div>
          <div className="space-y-3">
            <h1 className="font-heading text-3xl font-bold text-foreground">
              Payment confirmation pending
            </h1>
            <p className="text-muted-foreground text-base">
              We couldn't confirm your payment status automatically. Your
              payment may still be processing. Check your subscription status
              below.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button asChild>
              <Link to="/account/subscription">Check subscription</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/pricing">Back to pricing</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Polling state — waiting for webhook
  if (!isCompleted) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="mx-auto max-w-lg text-center space-y-8">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-primary/10">
            <RiLoader4Line className="size-10 text-primary animate-spin" />
          </div>
          <div className="space-y-3">
            <h1 className="font-heading text-3xl font-bold text-foreground">
              Processing your payment...
            </h1>
            <p className="text-muted-foreground text-base">
              We're confirming your payment with Stripe. This usually takes a
              few seconds.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <RiTimeLine className="size-4" />
            <span>
              Auto-refreshing every {POLL_INTERVAL / 1000}s (
              {pollCount}/{MAX_POLL_ATTEMPTS})
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Completed — show success with auto-redirect countdown
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="mx-auto max-w-lg text-center space-y-8">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-500/10">
          <RiCheckboxCircleLine className="size-10 text-emerald-500" />
        </div>
        <div className="space-y-3">
          <h1 className="font-heading text-3xl font-bold text-foreground">
            {t("success.title")}
          </h1>
          <p className="text-muted-foreground text-base">
            {t("success.description")}
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button asChild>
            <Link to="/account/subscription">{t("success.goToAccount")}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/pricing">Back to pricing</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Redirecting in {countdown}s...
        </p>
      </div>
    </div>
  )
}
