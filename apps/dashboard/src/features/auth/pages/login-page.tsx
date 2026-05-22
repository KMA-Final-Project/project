import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  RiAlertLine,
  RiArrowRightUpLine,
  RiShieldKeyholeLine,
} from "@remixicon/react"
import { useLocation, useNavigate } from "react-router"

import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"
import { useAuth } from "@/features/auth/auth-provider.tsx"
import { ApiError } from "@/shared/lib/http-client.ts"

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must have at least 8 characters."),
})

type LoginFormValues = z.infer<typeof loginSchema>

export const LoginPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const denied = Boolean(location.state && "denied" in location.state)

  const handleSubmit = form.handleSubmit(async (values) => {
    setFormError(null)

    try {
      await login(values)
      navigate("/overview", { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message)
        return
      }

      setFormError("Sign-in failed. Check your credentials and try again.")
    }
  })

  return (
    <div className="w-full max-w-md space-y-8">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs tracking-[0.22em] text-accent-foreground uppercase">
          <RiShieldKeyholeLine className="size-3.5" />
          JWT protected access
        </div>
        <div>
          <h2 className="font-heading text-3xl text-card-foreground">
            Sign in to the operator console
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
            Use an administrator account to access subscriptions, users, queue
            health, and failed pipeline diagnostics.
          </p>
        </div>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        {(denied || formError) && (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <div className="flex items-start gap-3">
              <RiAlertLine className="mt-0.5 size-4 shrink-0" />
              <div>{formError ?? "Administrator access is required."}</div>
            </div>
          </div>
        )}

        <FieldShell
          label="Operator email"
          hint="Use the same admin identity issued by the backend auth service."
          error={form.formState.errors.email?.message}
        >
          <Input
            autoComplete="email"
            placeholder="admin@kapter.local"
            {...form.register("email")}
          />
        </FieldShell>

        <FieldShell
          label="Password"
          hint="Minimum backend policy is already enforced server-side."
          error={form.formState.errors.password?.message}
        >
          <Input
            autoComplete="current-password"
            type="password"
            placeholder="Enter your administrator password"
            {...form.register("password")}
          />
        </FieldShell>

        <Button
          type="submit"
          size="lg"
          className="w-full justify-between"
          disabled={form.formState.isSubmitting}
        >
          <span>
            {form.formState.isSubmitting
              ? "Authenticating..."
              : "Enter control plane"}
          </span>
          <RiArrowRightUpLine data-icon="inline-end" className="size-4" />
        </Button>
      </form>
    </div>
  )
}

type FieldShellProps = {
  label: string
  hint: string
  error?: string
  children: React.ReactNode
}

const FieldShell = ({ label, hint, error, children }: FieldShellProps) => {
  return (
    <label className="block space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-card-foreground">
          {label}
        </span>
        <span className="signal-text">secure</span>
      </div>
      {children}
      <div className="text-xs leading-5 text-muted-foreground">
        {error ?? hint}
      </div>
    </label>
  )
}
