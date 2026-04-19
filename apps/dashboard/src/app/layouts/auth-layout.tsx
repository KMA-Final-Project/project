import { Outlet } from "react-router"

export const AuthLayout = () => {
  return (
    <div className="app-grid flex min-h-svh items-center justify-center px-6 py-10">
      <div className="panel-glow relative w-full max-w-5xl overflow-hidden rounded-[2rem] border border-border/70 bg-card/90 backdrop-blur">
        <div className="grid min-h-[720px] lg:grid-cols-[1.05fr_0.95fr]">
          <section className="relative hidden overflow-hidden border-r border-border/60 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--accent)_24%,transparent),transparent_42%),linear-gradient(140deg,color-mix(in_oklch,var(--sidebar)_92%,transparent),color-mix(in_oklch,var(--background)_72%,transparent))] p-10 lg:flex lg:flex-col lg:justify-between">
            <div className="space-y-5">
              <div className="signal-text text-accent">
                Kapter control plane
              </div>
              <div className="max-w-xl space-y-4">
                <h1 className="font-heading text-4xl leading-tight text-foreground xl:text-5xl">
                  Cinematic oversight for every subtitle pipeline.
                </h1>
                <p className="max-w-lg text-base leading-7 text-muted-foreground">
                  Kapter’s admin dashboard is tuned for operators: subscription
                  economics, queue visibility, and failure diagnosis in one
                  precise console.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/12 bg-background/55 p-4">
                <div className="signal-text">queue lanes</div>
                <div className="mt-3 font-heading text-2xl text-foreground">
                  02
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  transcription and ai-processing
                </div>
              </div>
              <div className="rounded-3xl border border-white/12 bg-background/55 p-4">
                <div className="signal-text">plan engine</div>
                <div className="mt-3 font-heading text-2xl text-foreground">
                  live
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  snapshot-safe pricing and quota variants
                </div>
              </div>
              <div className="rounded-3xl border border-white/12 bg-background/55 p-4">
                <div className="signal-text">operator mode</div>
                <div className="mt-3 font-heading text-2xl text-foreground">
                  ADMIN
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  protected JWT access only
                </div>
              </div>
            </div>
          </section>

          <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
            <Outlet />
          </section>
        </div>
      </div>
    </div>
  )
}
