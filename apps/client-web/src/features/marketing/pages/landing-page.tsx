import { useState, useEffect } from "react"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import {
  RiUploadCloud2Line,
  RiTimeLine,
  RiTranslate2,
  RiLightbulbLine,
  RiArrowRightLine,
  RiCheckLine,
  RiPlayLargeFill,
  RiYoutubeFill,
  RiVideoUploadLine,
  RiSoundModuleLine,
} from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// Interactive Karaoke Subtitle Simulation Constant Data
const phrase1Words = ["The", "quick", "brown", "fox", "jumps", "over", "the", "lazy", "dog."]
const phrase2Words = ["Learning", "languages", "has", "never", "been", "easier."]

export function LandingPage() {
  const { t } = useTranslation("marketing")

  const [activePhrase, setActivePhrase] = useState(1)
  const [activeWordIndex, setActiveWordIndex] = useState(0)

  useEffect(() => {
    const currentWords = activePhrase === 1 ? phrase1Words : phrase2Words
    const interval = setInterval(() => {
      setActiveWordIndex((prev) => {
        if (prev >= currentWords.length - 1) {
          // Pause at the end before switching phrases
          setTimeout(() => {
            setActivePhrase((p) => (p === 1 ? 2 : 1))
            setActiveWordIndex(0)
          }, 1200)
          clearInterval(interval)
          return prev
        }
        return prev + 1
      })
    }, 450)

    return () => clearInterval(interval)
  }, [activePhrase])

  return (
    <div className="flex flex-col relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-[-10%] left-[-10%] size-[500px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute top-[30%] right-[-10%] size-[500px] rounded-full bg-secondary/10 blur-[120px] pointer-events-none" />

      {/* ── Hero Section ──────────────────────────────────────── */}
      <section className="relative px-6 pt-20 pb-24 md:pt-28 md:pb-32">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-10 text-center">
          <div className="space-y-4">
            <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary px-3 py-1 font-sans text-xs font-semibold tracking-wide uppercase">
              Bilingual Karaoke Subtitles
            </Badge>
            <h1 className="max-w-4xl font-heading text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl leading-tight">
              {t("hero.title").replace("perfected", "")}
              <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                Perfected
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-base text-muted-foreground sm:text-lg md:text-xl leading-relaxed">
              {t("hero.subtitle")}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Button size="lg" className="h-12 px-6 shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/30 hover:scale-103" asChild>
              <Link to="/signup">
                {t("hero.cta")}
                <RiArrowRightLine className="ml-2 size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="h-12 px-6 border-border/60 hover:bg-muted/50" asChild>
              <a href="#features">See How It Works</a>
            </Button>
          </div>

          {/* Dynamic Karaoke Subtitle Mockup Player */}
          <div className="mt-8 w-full max-w-3xl rounded-2xl border border-border/40 bg-card/60 p-4 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-primary/20">
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-950 shadow-inner flex flex-col justify-end p-6">
              {/* Fake video background graphics */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/40 to-slate-950/20" />
              
              {/* Decorative visual elements simulating a video scene */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="size-16 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/20 text-white opacity-80 animate-pulse">
                  <RiPlayLargeFill className="size-6 ml-0.5" />
                </div>
              </div>

              {/* Subtitle simulation overlay */}
              <div className="relative z-10 w-full text-center space-y-3 pb-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/80 px-3 py-1 font-mono text-xs text-primary border border-white/5">
                  <span className="inline-block size-2 rounded-full bg-accent animate-ping" />
                  {activePhrase === 1 ? "00:12" : "00:15"}
                </div>
                
                {/* Active spoken text with word-level highlight */}
                <div className="text-xl sm:text-2xl md:text-3xl font-heading font-semibold tracking-wide text-white drop-shadow-md">
                  {activePhrase === 1 ? (
                    phrase1Words.map((word, idx) => (
                      <span
                        key={idx}
                        className={`inline-block mr-2 transition-all duration-200 ${
                          idx <= activeWordIndex 
                            ? "text-primary drop-shadow-[0_0_12px_rgba(48,144,224,0.6)] scale-105" 
                            : "text-white/80"
                        }`}
                      >
                        {word}
                      </span>
                    ))
                  ) : (
                    phrase2Words.map((word, idx) => (
                      <span
                        key={idx}
                        className={`inline-block mr-2 transition-all duration-200 ${
                          idx <= activeWordIndex 
                            ? "text-primary drop-shadow-[0_0_12px_rgba(48,144,224,0.6)] scale-105" 
                            : "text-white/80"
                        }`}
                      >
                        {word}
                      </span>
                    ))
                  )}
                </div>

                {/* Translated subtitle underneath */}
                <div className="text-sm sm:text-base md:text-lg text-emerald-400 font-medium tracking-wide drop-shadow">
                  {activePhrase === 1 
                    ? "Con cáo nâu nhảy qua con chó lười." 
                    : "Việc học ngôn ngữ chưa bao giờ dễ dàng hơn."
                  }
                </div>
              </div>

              {/* Fake player controls */}
              <div className="relative z-10 w-full pt-4 border-t border-white/10 flex items-center justify-between text-white/50 text-xs">
                <span className="font-mono">{activePhrase === 1 ? "00:12" : "00:15"} / 02:40</span>
                <div className="flex-1 mx-4 h-1 rounded bg-white/20 relative">
                  <div 
                    className="absolute top-0 left-0 h-full bg-primary rounded transition-all duration-300"
                    style={{ 
                      width: activePhrase === 1 
                        ? `${((activeWordIndex + 1) / phrase1Words.length) * 50}%` 
                        : `${50 + ((activeWordIndex + 1) / phrase2Words.length) * 50}%`
                    }}
                  />
                </div>
                <RiSoundModuleLine className="size-4 cursor-pointer hover:text-white" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Proof Strip ───────────────────────────────────────── */}
      <section className="border-y border-border/40 bg-card/30 backdrop-blur-sm relative z-10">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-8 md:grid-cols-4">
          {[
            { icon: RiTimeLine, label: t("proofStrip.wordTiming") },
            { icon: RiTranslate2, label: t("proofStrip.bilingual") },
            { icon: RiLightbulbLine, label: t("proofStrip.aiPowered") },
            { icon: RiCheckLine, label: t("proofStrip.quotaAware") },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 justify-center">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                <Icon className="size-5 text-primary" />
              </div>
              <span className="text-sm font-semibold tracking-tight text-foreground">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features Bento Grid Showcase ──────────────────────── */}
      <section id="features" className="relative px-6 py-24 md:py-32">
        <div className="mx-auto max-w-6xl space-y-12">
          <div className="text-center space-y-4 max-w-2xl mx-auto">
            <Badge variant="outline" className="border-secondary/30 bg-secondary/5 text-secondary">
              Product Capabilities
            </Badge>
            <h2 className="font-heading text-3xl font-extrabold text-foreground sm:text-4xl md:text-5xl leading-tight">
              {t("features.title")}
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Explore how Kapter integrates custom-built AI pipelines, bilingual NMT translations, and frame-accurate timing to deliver premium media experiences.
            </p>
          </div>

          {/* Asymmetric Bento Box Grid */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Bento Card 1 - Word Level Karaoke (Span 2 Cols) */}
            <Card className="md:col-span-2 overflow-hidden flex flex-col justify-between border-border/60 bg-card/90 dark:bg-card/75 hover:border-primary/30 transition-all duration-300 hover:shadow-lg">
              <CardHeader className="pb-4">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 mb-3">
                  <RiTimeLine className="size-5 text-primary" />
                </div>
                <CardTitle className="text-xl font-bold font-heading">{t("features.transcription.title")}</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  {t("features.transcription.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6 pt-0">
                {/* Visual Representation of Timestamp Metadata */}
                <div className="rounded-xl border border-border/45 bg-slate-950/95 dark:bg-slate-950/80 p-4 font-mono text-[11px] text-white/90 space-y-2.5">
                  <div className="flex items-center gap-2 border-b border-white/5 pb-2 text-[10px] text-muted-foreground">
                    <span className="w-16">TIMESTAMPS</span>
                    <span>SEGMENT WORD ALIGNMENT</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-16 text-primary select-none">[00:12.24]</span>
                    <div className="flex flex-wrap gap-1">
                      <span className="rounded bg-primary/20 px-1.5 py-0.5 border border-primary/30 text-primary">The</span>
                      <span className="rounded bg-white/5 px-1.5 py-0.5">quick</span>
                      <span className="rounded bg-white/5 px-1.5 py-0.5">brown</span>
                      <span className="rounded bg-white/5 px-1.5 py-0.5">fox</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-16 text-primary select-none">[00:13.68]</span>
                    <div className="flex flex-wrap gap-1">
                      <span className="rounded bg-white/5 px-1.5 py-0.5">jumps</span>
                      <span className="rounded bg-white/5 px-1.5 py-0.5">over</span>
                      <span className="rounded bg-white/5 px-1.5 py-0.5">the</span>
                      <span className="rounded bg-primary/20 px-1.5 py-0.5 border border-primary/30 text-primary">lazy</span>
                      <span className="rounded bg-primary/20 px-1.5 py-0.5 border border-primary/30 text-primary">dog.</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bento Card 2 - Bilingual (Span 1 Col) */}
            <Card className="overflow-hidden flex flex-col justify-between border-border/60 bg-card/90 dark:bg-card/75 hover:border-secondary/30 transition-all duration-300 hover:shadow-lg">
              <CardHeader className="pb-4">
                <div className="flex size-10 items-center justify-center rounded-xl bg-secondary/10 border border-secondary/20 mb-3">
                  <RiTranslate2 className="size-5 text-secondary" />
                </div>
                <CardTitle className="text-xl font-bold font-heading">{t("features.translation.title")}</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  {t("features.translation.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6 pt-0">
                <div className="rounded-xl border border-border/45 bg-muted/70 dark:bg-muted/30 p-4 space-y-3 text-xs">
                  <div className="border-l-2 border-primary pl-2.5 py-0.5">
                    <p className="font-semibold text-foreground">Subtitle Track 1 (EN)</p>
                    <p className="text-muted-foreground">High-accuracy bilingual subtitles.</p>
                  </div>
                  <div className="border-l-2 border-emerald-400 pl-2.5 py-0.5">
                    <p className="font-semibold text-foreground">Subtitle Track 2 (VI)</p>
                    <p className="text-muted-foreground">Phụ đề song ngữ độ chính xác cao.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bento Card 3 - Direct Ingestion (Span 1 Col) */}
            <Card className="overflow-hidden flex flex-col justify-between border-border/60 bg-card/90 dark:bg-card/75 hover:border-primary/30 transition-all duration-300 hover:shadow-lg">
              <CardHeader className="pb-4">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 mb-3">
                  <RiUploadCloud2Line className="size-5 text-primary" />
                </div>
                <CardTitle className="text-xl font-bold font-heading">{t("howItWorks.step1")}</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Direct client-side media ingestion with support for link parsing and local extraction.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6 pt-0">
                <div className="rounded-xl border border-border/45 bg-muted/70 dark:bg-muted/30 p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 border border-border/30">
                    <RiYoutubeFill className="size-4 text-red-500" />
                    <span className="text-[11px] text-muted-foreground truncate flex-1">youtube.com/watch?v=s...</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 border border-border/30">
                    <RiVideoUploadLine className="size-4 text-primary" />
                    <span className="text-[11px] text-foreground font-medium flex-1">lesson_audio.mp4</span>
                    <span className="text-[10px] text-muted-foreground">12.4 MB</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bento Card 4 - AI Explanations (Span 2 Cols) */}
            <Card className="md:col-span-2 overflow-hidden flex flex-col justify-between border-border/60 bg-card/90 dark:bg-card/75 hover:border-accent/30 transition-all duration-300 hover:shadow-lg">
              <CardHeader className="pb-4">
                <div className="flex size-10 items-center justify-center rounded-xl bg-accent/10 border border-accent/20 mb-3">
                  <RiLightbulbLine className="size-5 text-accent" />
                </div>
                <CardTitle className="text-xl font-bold font-heading">{t("features.ai.title")}</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  {t("features.ai.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6 pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/45 bg-muted/60 dark:bg-muted/20 p-3.5 space-y-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <span className="underline decoration-primary/50 decoration-2">Immersive</span>
                      <span className="rounded bg-primary/10 px-1 text-[10px] text-primary">Adj</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Providing a deep, absorbing, or surrounding visual/auditory environment.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/45 bg-muted/60 dark:bg-muted/20 p-3.5 space-y-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <span className="underline decoration-primary/50 decoration-2">Karaoke Timing</span>
                      <span className="rounded bg-primary/10 px-1 text-[10px] text-primary">Noun</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Highlighting individual words precisely in sync as they are spoken.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ── CTA Section ───────────────────────────────────────── */}
      <section className="relative px-6 py-24 md:py-32 text-center overflow-hidden">
        {/* Ambient glow behind CTA */}
        <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-96 rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
        
        <div className="relative mx-auto max-w-3xl space-y-6 z-10">
          <h2 className="font-heading text-3xl font-extrabold text-foreground sm:text-4xl md:text-5xl leading-tight">
            {t("cta.title")}
          </h2>
          <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg">
            {t("cta.subtitle")}
          </p>
          <div className="pt-4">
            <Button size="lg" className="h-12 px-8 shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 hover:scale-103" asChild>
              <Link to="/signup">
                {t("cta.button")}
                <RiArrowRightLine className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

