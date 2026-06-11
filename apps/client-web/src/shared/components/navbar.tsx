import { useState } from "react"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { RiMenu3Line, RiCloseLine, RiSunLine, RiMoonLine, RiTranslate2 } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"
import { useAuth } from "@/features/auth/auth-provider"

export function Navbar() {
  const { theme, toggleTheme } = useTheme()
  const { isAuthenticated, logout } = useAuth()
  const { i18n } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const currentLang = i18n.language || "en"
  const toggleLanguage = () => {
    const nextLang = currentLang.startsWith("vi") ? "en" : "vi"
    void i18n.changeLanguage(nextLang)
  }

  return (
    <header className="fixed top-4 left-4 right-4 z-50">
      <nav className="mx-auto max-w-6xl rounded-2xl border border-border/40 bg-card/65 px-6 py-3 shadow-md backdrop-blur-xl transition-all duration-300">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-heading text-xl font-bold tracking-tight text-foreground transition-opacity hover:opacity-90">
            <img 
              src="/logo/standalone_colored.png" 
              alt="Kapter Logo" 
              className="h-8 w-auto object-contain transition-transform duration-300 hover:scale-105" 
            />
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Kapter</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-6 md:flex">
            <Link
              to="/pricing"
              className="text-sm font-medium text-muted-foreground transition-all hover:text-foreground hover:scale-102"
            >
              Pricing
            </Link>

            <div className="h-4 w-px bg-border/50" />

            <button
              type="button"
              onClick={toggleTheme}
              className="cursor-pointer rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <RiSunLine size={18} /> : <RiMoonLine size={18} />}
            </button>

            <button
              type="button"
              onClick={toggleLanguage}
              className="cursor-pointer flex items-center gap-1.5 rounded-full px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground text-xs font-semibold"
              aria-label="Switch language"
            >
              <RiTranslate2 size={16} />
              <span className="uppercase">{currentLang.slice(0, 2)}</span>
            </button>

            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/account">Account</Link>
                </Button>
                <Button variant="secondary" size="sm" onClick={() => logout()}>
                  Logout
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/login">Login</Link>
                </Button>
                <Button size="sm" className="shadow-sm shadow-primary/20 transition-all hover:shadow-md hover:shadow-primary/30 hover:scale-102" asChild>
                  <Link to="/signup">Sign Up</Link>
                </Button>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="cursor-pointer rounded-lg p-1 text-foreground transition-colors hover:bg-muted md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <RiCloseLine size={22} /> : <RiMenu3Line size={22} />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="mt-4 flex flex-col gap-3 border-t border-border/30 pt-4 md:hidden">
            <Link
              to="/pricing"
              onClick={() => setMobileOpen(false)}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </Link>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={toggleTheme}
                className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <RiSunLine size={18} /> : <RiMoonLine size={18} />}
              </button>

              <button
                type="button"
                onClick={toggleLanguage}
                className="cursor-pointer flex items-center gap-1.5 rounded-full px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground text-xs font-semibold"
                aria-label="Switch language"
              >
                <RiTranslate2 size={16} />
                <span className="uppercase">{currentLang.slice(0, 2)}</span>
              </button>
            </div>

            <div className="h-px bg-border/30 w-full" />

            {isAuthenticated ? (
              <div className="flex flex-col gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/account" onClick={() => setMobileOpen(false)}>Account</Link>
                </Button>
                <Button variant="secondary" size="sm" onClick={() => { logout(); setMobileOpen(false); }}>
                  Logout
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/login" onClick={() => setMobileOpen(false)}>Login</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/signup" onClick={() => setMobileOpen(false)}>Sign Up</Link>
                </Button>
              </div>
            )}
          </div>
        )}
      </nav>
    </header>
  )
}

