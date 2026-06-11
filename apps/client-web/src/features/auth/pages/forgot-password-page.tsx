import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { forgotPasswordRequest } from "@/features/auth/auth-api"
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

const forgotSchema = z.object({
  email: z.email(),
})

type ForgotValues = z.infer<typeof forgotSchema>

export function ForgotPasswordPage() {
  const { t } = useTranslation("auth")
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
  })

  const onSubmit = async (values: ForgotValues) => {
    setIsLoading(true)
    try {
      await forgotPasswordRequest(values.email)
      setSent(true)
      toast.success(t("forgotPassword.success"))
    } catch {
      // Error toast handled by api-client interceptor
    } finally {
      setIsLoading(false)
    }
  }

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("forgotPassword.title")}</CardTitle>
          <CardDescription>{t("forgotPassword.success")}</CardDescription>
        </CardHeader>
        <CardFooter className="flex-col gap-4">
          <Button
            className="w-full"
            onClick={() =>
              navigate(
                `/reset-password?email=${encodeURIComponent(getValues("email"))}`,
              )
            }
          >
            {t("forgotPassword.submit")}
          </Button>
          <Link
            to="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("forgotPassword.backToLogin")}
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("forgotPassword.title")}</CardTitle>
        <CardDescription>{t("forgotPassword.description")}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("forgotPassword.email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {t("forgotPassword.submit")}
          </Button>
          <Link
            to="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("forgotPassword.backToLogin")}
          </Link>
        </CardFooter>
      </form>
    </Card>
  )
}
