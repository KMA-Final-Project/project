import { useEffect, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { RiLoader4Line } from "@remixicon/react"

import { publicApi } from "@/shared/lib/api-client"
import { authStorage } from "@/features/auth/auth-storage"
import type { AuthResponse } from "@kapter/contracts"

export function HandoffPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const consumedRef = useRef(false)

  const token = searchParams.get("token") ?? ""
  const target = searchParams.get("target") ?? "pricing"
  const fromMobile = searchParams.get("fromMobile") === "1"

  useEffect(() => {
    if (consumedRef.current || !token) return
    consumedRef.current = true

    const consume = async () => {
      try {
        const res = await publicApi.post<AuthResponse>(
          "/auth/mobile-web-handoff/consume",
          { token },
        )
        authStorage.set(res.data)

        const dest =
          target === "account-subscription"
            ? "/account/subscription"
            : "/pricing"
        navigate(`${dest}?fromMobile=1`, { replace: true })
      } catch {
        // Token invalid/expired — fall back to login
        const returnTo = target === "account-subscription"
          ? "/account/subscription"
          : "/pricing"
        navigate(`/login?fromMobile=1&returnTo=${encodeURIComponent(returnTo)}`, {
          replace: true,
        })
      }
    }

    void consume()
  }, [token, target, fromMobile, navigate])

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="flex items-center gap-3 text-muted-foreground">
        <RiLoader4Line className="size-5 animate-spin" />
        <span>Authenticating...</span>
      </div>
    </div>
  )
}
