import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { verifyRequest, resendRegistrationOtpRequest } from "@/features/auth/auth-api"
import { authStorage } from "@/features/auth/auth-storage"
import { getCheckoutIntent } from "@/features/auth/auth-intent"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"

const verifySchema = z.object({
  otp: z.string().length(6),
})

type VerifyValues = z.infer<typeof verifySchema>

export function VerifyPage() {
  const { t } = useTranslation("auth")
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get("email") ?? ""
  const [isLoading, setIsLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerifyValues>({
    resolver: zodResolver(verifySchema),
  })

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  const onSubmit = async (values: VerifyValues) => {
    setIsLoading(true)
    try {
      const session = await verifyRequest({ email, otp: values.otp })
      authStorage.set(session)
      const intent = getCheckoutIntent()
      navigate(intent?.returnTo ?? "/account", { replace: true })
    } catch {
      // Error toast handled by api-client interceptor
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return
    try {
      await resendRegistrationOtpRequest(email)
      toast.success(t("verify.resent"))
      setResendCooldown(30)
    } catch {
      // Error toast handled by api-client interceptor
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("verify.title")}</CardTitle>
        <CardDescription>
          {t("verify.description", { email })}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp">{t("verify.otp")}</Label>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              aria-invalid={!!errors.otp}
              {...register("otp")}
            />
            {errors.otp && (
              <p className="text-xs text-destructive">{errors.otp.message}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {t("verify.submit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={resendCooldown > 0}
            onClick={handleResend}
          >
            {resendCooldown > 0
              ? `${t("verify.resend")} (${resendCooldown}s)`
              : t("verify.resend")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
