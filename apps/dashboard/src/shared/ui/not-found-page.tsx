import { Link } from "react-router"

import { Button } from "@/components/ui/button.tsx"

export const NotFoundPage = () => {
  return (
    <div className="app-grid flex min-h-svh items-center justify-center px-6 py-10">
      <div className="panel-glow max-w-xl rounded-[2rem] border border-border/70 bg-card/90 p-10 text-center backdrop-blur">
        <div className="signal-text">404</div>
        <h1 className="mt-4 font-heading text-4xl text-card-foreground">
          The control room you asked for does not exist.
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
          Head back to the dashboard entry point and continue from a known
          route.
        </p>
        <Button asChild className="mt-8">
          <Link to="/">Return to dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
