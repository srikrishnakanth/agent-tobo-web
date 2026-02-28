import "./globals.css"
import type { ReactNode } from "react"

export const metadata = {
  title: "Agent Tobo",
  description: "Cinematic Autonomous Builder",
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
