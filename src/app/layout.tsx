
import "./globals.css"

export const metadata = {
  title: "Agent Tobo",
  description: "Cinematic Autonomous Builder"
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
