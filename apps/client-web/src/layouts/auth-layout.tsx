import { Outlet, Link } from "react-router"

export function AuthLayout() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4 overflow-hidden">
      {/* Background ambient glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 size-96 rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 size-96 rounded-full bg-secondary/10 blur-[100px] pointer-events-none" />
      
      <div className="relative w-full max-w-md z-10">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Link to="/" className="flex items-center gap-2 font-heading text-3xl font-bold tracking-tight text-foreground transition-opacity hover:opacity-90">
            <img 
              src="/logo/standalone_colored.png" 
              alt="Kapter Logo" 
              className="h-10 w-auto object-contain transition-transform duration-300 hover:scale-105" 
            />
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Kapter</span>
          </Link>
          <p className="text-sm text-muted-foreground">High-Accuracy Bilingual Subtitles</p>
        </div>
        
        <Outlet />
      </div>
    </div>
  )
}

