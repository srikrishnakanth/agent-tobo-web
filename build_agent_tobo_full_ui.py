import os
import subprocess
from pathlib import Path

BASE = Path(".").resolve()

def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"✔ {path}")

# ----------------------------------
# GLOBAL CSS (Dark System)
# ----------------------------------

write(BASE / "src/app/globals.css", """
:root {
  --bg-primary: #080B14;
  --bg-surface: #0F1525;
  --accent: #00E5C8;
  --text-primary: #F0F4FF;
  --text-muted: #6B7A99;
}

html, body {
  padding: 0;
  margin: 0;
  background: radial-gradient(circle at center, #0D1525 0%, #080B14 100%);
  color: var(--text-primary);
  font-family: system-ui, -apple-system, BlinkMacSystemFont;
}

.glass {
  background: rgba(15, 21, 37, 0.8);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 16px;
}

.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.message {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 14px;
  margin-bottom: 12px;
}

.system {
  background: var(--bg-surface);
}

.user {
  background: var(--accent);
  color: black;
  margin-left: auto;
}

.input-dock {
  display: flex;
  gap: 10px;
  padding: 16px;
  background: var(--bg-surface);
}

input {
  flex: 1;
  padding: 12px;
  border-radius: 12px;
  border: none;
  outline: none;
}

button {
  padding: 12px 20px;
  border-radius: 12px;
  border: none;
  background: var(--accent);
  color: black;
  font-weight: 600;
}
""")

# ----------------------------------
# LAYOUT
# ----------------------------------

write(BASE / "src/app/layout.tsx", """
import "./globals.css"

export const metadata = {
  title: "Agent Tobo",
  description: "Autonomous Application Builder",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
""")

# ----------------------------------
# ADVANCED CHAT UI
# ----------------------------------

write(BASE / "src/app/page.tsx", """
"use client"

import { useState, useEffect, useRef } from "react"

export default function Home() {
  const [scope, setScope] = useState({})
  const [stage, setStage] = useState("LOAD")
  const [messages, setMessages] = useState([
    { sender: "system", text: "Welcome to Agent Tobo." },
    { sender: "system", text: "Tell me about your business." }
  ])
  const [input, setInput] = useState("")
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function sendMessage(text) {
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
      setMessages(prev => [
        ...prev,
        { sender: "system", text: `Recommended Hosting: ${data.hosting}` },
        { sender: "system", text: `Total Cost (incl GST): ₹${data.pricing.total}` },
        { sender: "system", text: data.agreement }
      ])
    }

    setScope(updated)
    setStage(data.stage)
    setInput("")
  }

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.sender}`}>
            {m.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="input-dock">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type your response..."
        />
        <button onClick={() => sendMessage(input)}>
          Send
        </button>
      </div>
    </div>
  )
}
""")

print("Committing changes...")
subprocess.run(["git", "add", "."])
subprocess.run(["git", "commit", "-m", "Full micro-detailed dark UI upgrade"])
subprocess.run(["git", "push"])

print("Deployment triggered. Wait 1–2 minutes.")

