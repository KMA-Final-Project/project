import { Link } from "react-router"

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-card/50 py-16 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          {/* Brand Col */}
          <div className="md:col-span-2 space-y-4">
            <Link to="/" className="flex items-center gap-2 font-heading text-xl font-bold text-foreground">
              <img 
                src="/logo/standalone_colored.png" 
                alt="Kapter Logo" 
                className="h-7 w-auto object-contain" 
              />
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Kapter</span>
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">
              High-accuracy bilingual subtitles with word-level karaoke timing. Elevate your media consumption and content creation.
            </p>
          </div>

          {/* Links Column 1 */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Product</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Pricing Plans
                </Link>
              </li>
              <li>
                <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Core Features
                </a>
              </li>
            </ul>
          </div>

          {/* Links Column 2 */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Legal</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border/30 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Kapter. All rights reserved.
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Designed with excellence.</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

