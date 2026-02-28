import subprocess
from pathlib import Path

BASE = Path(".").resolve()

def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"✔ {path}")

# ---------------- GLOBAL CSS ----------------

write(BASE / "src/app/globals.css", """
:root {
  --bg-main: #05070F;
  --bg-surface: rgba(20, 28, 45, 0.7);
  --accent: #00F5C3;
  --text-main: #E8F0FF;
  --text-muted: #7C8BA3;
}

html, body {
  padding: 0;
  margin: 0;
  background: radial-gradient(circle at center, #0E1628 0%, #05070F 100%);
  color: var(--text-main);
  font-family: system-ui, -apple-system, BlinkMacSystemFont;
}

.glass {
  background: var(--bg-surface);
  backdrop-filter: blur(25px);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 18px;
}

.fullscreen {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.centered {
  display: flex;
  justify-content: center;
  align-items: center;
}

.logo {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 1px;
  animation: fadeIn 1.2s ease forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.chat-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.message {
  max-width: 75%;
  padding: 14px 18px;
  border-radius: 14px;
  margin-bottom: 14px;
}

.system {
  background: var(--bg-surface);
}

.user {
  background: var(--accent);
  color: black;
  margin-left: auto;
}

.input-bar {
  display: flex;
  padding: 18px;
  gap: 10px;
  background: rgba(10, 15, 25, 0.95);
}

input {
  flex: 1;
  padding: 14px;
  border-radius: 14px;
  border: none;
  outline: none;
}

button {
  padding: 14px 20px;
  border-radius: 14px;
  border: none;
  background: var(--accent);
  color: black;
  font-weight: 600;
}

.panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #0E1628;
  border-top: 1px solid rgba(255,255,255,0.1);
  padding: 24px;
  border-radius: 24px 24px 0 0;
  animation: slideUp 0.4s ease forwards;
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
""")

# ---------------- LAYOUT ----------------

write(BASE / "src/app/layout.tsx", """
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
""")

# ---------------- CINEMATIC UI ----------------

write(BASE / "src/app/page.tsx", """
"use client"

import { useState, useEffect, useRef } from "react"

export default function Home() {
  const [stage, setStage] = useState("LOAD")
  const [scope, setScope] = useState({})
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [panel, setPanel] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    setTimeout(() => {
      setMessages([
        { sender: "system", text: "Welcome to Agent Tobo." },
        { sender: "system", text: "Describe your business." }
      ])
    }, 800)
  }, [])

  async function send(text) {
    if (!text) return

    let updated = { ...scope }

    if (!updated.businessName) updated.businessName = text
    else if (!updated.platforms)
      updated.platforms = text.split(",").map(p => p.trim())
    else if (!updated.features)
      updated.features = text.split(",").map(f => f.trim())

    const res = await fetch("/api/autonomous", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, scope: updated })
    })

    const data = await res.json()

    setMessages(prev => [
      ...prev,
      { sender: "user", text },
      { sender: "system", text: data.question }
    ])

    if (data.pricing) {
      setPanel({
        hosting: data.hosting,
        total: data.pricing.total,
        agreement: data.agreement
      })
    }

    setScope(updated)
    setStage(data.stage)
    setInput("")
  }

  return (
    <div className="fullscreen">
      <div className="centered" style={{ padding: "20px" }}>
        <div className="logo">AGENT TOBO</div>
      </div>

      <div className="chat-area">
        {messages.map((m, i) => (
          <div key={i}
            className={`message ${m.sender}`}>
            {m.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="input-bar">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type your response..."
        />
        <button onClick={() => send(input)}>Send</button>
      </div>

      {panel && (
        <div className="panel">
          <h3>Project Summary</h3>
          <p><strong>Hosting:</strong> {panel.hosting}</p>
          <p><strong>Total Cost:</strong> ₹{panel.total}</p>
          <pre style={{ whiteSpace: "pre-wrap" }}>{panel.agreement}</pre>
        </div>
      )}
    </div>
  )
}
""")

print("🔄 Committing...")
subprocess.run(["git", "add", "."])
subprocess.run(["git", "commit", "-m", "Cinematic full-stage UI build"])
subprocess.run(["git", "push"])
print("🚀 Deployment triggered.")
