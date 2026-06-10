import { Outlet } from "react-router"
import { Navbar } from "@/shared/components/navbar"
import { Footer } from "@/shared/components/footer"

export function MarketingLayout() {
  return (
    <>
      <Navbar />
      <main className="pt-24">
        <Outlet />
      </main>
      <Footer />
    </>
  )
}
