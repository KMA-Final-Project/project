import {
  RiBarChartBoxLine,
  RiLogoutBoxRLine,
  RiRadarLine,
  RiStackLine,
  RiUserLine,
} from "@remixicon/react"
import { NavLink, Outlet } from "react-router"

import { Button } from "@/components/ui/button.tsx"
import { useAuth } from "@/features/auth/auth-provider.tsx"
import { cn } from "@/lib/utils"

const navigation = [
  {
    label: "Overview",
    to: "/overview",
    icon: RiBarChartBoxLine,
  },
  {
    label: "Users",
    to: "/users",
    icon: RiUserLine,
  },
  {
    label: "Plans",
    to: "/plans",
    icon: RiStackLine,
  },
  {
    label: "Queues",
    to: "/monitoring/queues",
    icon: RiRadarLine,
  },
  {
    label: "Failures",
    to: "/monitoring/failures",
    icon: RiRadarLine,
  },
]

export const AdminLayout = () => {
  const { logout, session } = useAuth()

  return (
    <div className="app-grid min-h-svh bg-background">
      <div className="grid min-h-svh lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-border/70 bg-sidebar/92 px-5 py-5 backdrop-blur lg:border-r lg:border-b-0 lg:px-6 lg:py-6">
          <div className="flex items-center justify-between gap-4 lg:block">
            <div className="space-y-3">
              <div>
                <div className="signal-text text-accent">Kapter admin</div>
                <div className="mt-2 font-heading text-2xl text-sidebar-foreground">
                  Control plane
                </div>
              </div>
              <p className="max-w-xs text-sm leading-6 text-muted-foreground">
                Subscription economics, queue temperature, and operator-grade
                visibility for the bilingual subtitle system.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              onClick={logout}
            >
              <RiLogoutBoxRLine data-icon="inline-start" />
              Logout
            </Button>
          </div>

          <nav className="mt-8 grid gap-2">
            {navigation.map(({ label, to, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-3xl border border-transparent px-4 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "border-sidebar-primary/30 bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/80 hover:border-border/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )
                }
              >
                <Icon className="size-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-10 hidden rounded-3xl border border-border/60 bg-background/45 p-4 lg:block">
            <div className="signal-text">operator profile</div>
            <div className="mt-3 font-medium text-sidebar-foreground">
              {session?.user.fullName}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {session?.user.email}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-sidebar-accent/75 px-3 py-2 text-xs tracking-[0.2em] text-sidebar-accent-foreground uppercase">
              <span>{session?.user.role}</span>
              <span>secured</span>
            </div>
            <Button
              variant="outline"
              className="mt-4 w-full justify-start"
              onClick={logout}
            >
              <RiLogoutBoxRLine data-icon="inline-start" />
              Logout
            </Button>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="panel-glow min-h-[calc(100svh-2rem)] rounded-[2rem] border border-border/70 bg-card/88 p-4 backdrop-blur sm:p-6 lg:p-8">
            <header className="mb-8 flex flex-col gap-5 border-b border-border/70 pb-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="signal-text">cinematic operations console</div>
                <h1 className="mt-3 font-heading text-3xl text-card-foreground">
                  Admin dashboard
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Real-time operational control for subscriptions, users, and
                  subtitle processing health.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <SignalBadge label="Environment" value="local" tone="primary" />
                <SignalBadge label="Auth" value="jwt" tone="accent" />
                <SignalBadge label="Role" value={session?.user.role ?? "n/a"} />
              </div>
            </header>

            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

type SignalBadgeProps = {
  label: string
  value: string
  tone?: "default" | "primary" | "accent"
}

const SignalBadge = ({ label, value, tone = "default" }: SignalBadgeProps) => {
  return (
    <div
      className={cn(
        "rounded-3xl border px-4 py-3",
        tone === "primary" && "border-primary/30 bg-primary/12",
        tone === "accent" && "border-accent/30 bg-accent/12",
        tone === "default" && "border-border bg-background/70"
      )}
    >
      <div className="signal-text">{label}</div>
      <div className="mt-2 font-heading text-sm tracking-[0.26em] text-card-foreground uppercase">
        {value}
      </div>
    </div>
  )
}
