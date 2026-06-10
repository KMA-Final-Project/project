import { Outlet, NavLink } from "react-router"
import { Navbar } from "@/shared/components/navbar"

const navItems = [
  { to: "/account", label: "Profile", end: true },
  { to: "/account/subscription", label: "Subscription" },
]

export function AccountLayout() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 pt-28 pb-16">
        <div className="flex flex-col gap-8 md:flex-row">
          <aside className="w-full md:w-48">
            <nav className="flex gap-2 md:flex-col">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </aside>
          <div className="flex-1">
            <Outlet />
          </div>
        </div>
      </main>
    </>
  )
}
