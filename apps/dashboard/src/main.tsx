import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { AppProviders } from "@/app/providers.tsx"
import { AppRouter } from "@/app/router.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>
)
