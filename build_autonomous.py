import os
import subprocess
from pathlib import Path

BASE = Path(".").resolve()

def write_file(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"✔ Created: {path}")

# -----------------------
# CORE FILES
# -----------------------

write_file(BASE / "core/state/session-types.ts", """
export type Stage =
  | "LOAD"
  | "REQUIREMENTS"
  | "PRICING"
  | "AGREEMENT"
  | "PAYMENT"
  | "DASHBOARD"

export interface ProjectScope {
  businessName?: string
  platforms?: string[]
  features?: string[]
}

export interface SessionState {
  stage: Stage
  scope: ProjectScope
}
""")

write_file(BASE / "core/state/stage-machine.ts", """
import { Stage } from "./session-types"

export function nextStage(stage: Stage): Stage {
  switch (stage) {
    case "LOAD": return "REQUIREMENTS"
    case "REQUIREMENTS": return "PRICING"
    case "PRICING": return "AGREEMENT"
    case "AGREEMENT": return "PAYMENT"
    case "PAYMENT": return "DASHBOARD"
    default: return stage
  }
}
""")

write_file(BASE / "core/engine/conversation-engine.ts", """
import { SessionState } from "../state/session-types"

export function getNextQuestion(session: SessionState): string {
  const s = session.scope

  if (!s.businessName) return "What is your business name?"
  if (!s.platforms) return "Which platforms? (web, android, ios)"
  if (!s.features) return "List main features separated by comma."

  return "Requirements captured."
}
""")

write_file(BASE / "core/engine/pricing-engine.ts", """
const GST = 0.18

export function calculatePrice(featureCount: number) {
  const base = 10000
  const featureCost = featureCount * 2000
  const subtotal = base + featureCost
  const gst = subtotal * GST
  const total = subtotal + gst
  return { subtotal, gst, total }
}
""")

write_file(BASE / "core/engine/hosting-engine.ts", """
export function recommendHosting(featureCount: number) {
  if (featureCount <= 5) return "Shared Hosting"
  if (featureCount <= 15) return "VPS"
  return "Dedicated Server"
}
""")

write_file(BASE / "core/engine/agreement-engine.ts", """
export function generateAgreement(scope: any, total: number) {
  return `
PROJECT AGREEMENT

Business: ${scope.businessName}
Platforms: ${scope.platforms?.join(", ")}
Features: ${scope.features?.join(", ")}

Total Cost (incl GST): ₹${total}

Ownership transfers after full payment.
`
}
""")

write_file(BASE / "core/engine/autonomous-engine.ts", """
import { nextStage } from "../state/stage-machine"
import { getNextQuestion } from "./conversation-engine"
import { calculatePrice } from "./pricing-engine"
import { recommendHosting } from "./hosting-engine"
import { generateAgreement } from "./agreement-engine"

export function runAutonomous(session: any) {
  const question = getNextQuestion(session)

  if (question !== "Requirements captured.") {
    return { stage: session.stage, question }
  }

  const featureCount = session.scope.features.length
  const pricing = calculatePrice(featureCount)
  const hosting = recommendHosting(featureCount)
  const agreement = generateAgreement(session.scope, pricing.total)

  return {
    stage: nextStage(session.stage),
    question: "Generating pricing and agreement...",
    pricing,
    hosting,
    agreement,
  }
}
""")

# -----------------------
# API ROUTE
# -----------------------

write_file(BASE / "src/app/api/autonomous/route.ts", """
import { NextResponse } from "next/server"
import { runAutonomous } from "../../../../core/engine/autonomous-engine"

export async function POST(req: Request) {
  const body = await req.json()
  const result = runAutonomous(body)
  return NextResponse.json(result)
}
""")

# -----------------------
# FRONTEND UI
# -----------------------

write_file(BASE / "src/app/page.tsx", """
"use client"

import { useState } from "react"

export default function Home() {
  const [scope, setScope] = useState<any>({})
  const [stage, setStage] = useState("LOAD")
  const [messages, setMessages] = useState<any[]>([
    { sender: "system", text: "Welcome. Click Start." },
  ])
  const [input, setInput] = useState("")

  async function send(text: string) {
    let updated = { ...scope }

    if (!updated.businessName) updated.businessName = text
    else if (!updated.platforms)
      updated.platforms = text.split(",").map((p) => p.trim())
    else if (!updated.features)
      updated.features = text.split(",").map((f) => f.trim())

    const res = await fetch("/api/autonomous", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, scope: updated }),
    })

    const data = await res.json()

    setScope(updated)
    setStage(data.stage)

    setMessages((prev) => [
      ...prev,
      { sender: "user", text },
      { sender: "system", text: data.question },
    ])

    if (data.pricing) {
      setMessages((prev) => [
        ...prev,
        { sender: "system", text: `Hosting: ${data.hosting}` },
        { sender: "system", text: `Total: ₹${data.pricing.total}` },
        { sender: "system", text: data.agreement },
      ])
    }

    setInput("")
  }

  return (
    <main className="flex flex-col h-screen p-4 bg-gray-100">
      <div className="flex-1 overflow-auto space-y-3">
        {messages.map((m, i) => (
          <div key={i}
            className={m.sender === "system"
              ? "bg-white p-3 rounded max-w-xs"
              : "bg-black text-white p-3 rounded max-w-xs ml-auto"}>
            {m.text}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {messages.length === 1 ? (
          <button className="w-full bg-black text-white p-3 rounded"
            onClick={() => send("")}>
            Start
          </button>
        ) : (
          <>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 border p-2 rounded"
            />
            <button
              onClick={() => send(input)}
              className="bg-black text-white px-4 rounded">
              Send
            </button>
          </>
        )}
      </div>
    </main>
  )
}
""")

# -----------------------
# GIT COMMIT
# -----------------------

print("\n🔄 Committing changes...")
subprocess.run(["git", "add", "."])
subprocess.run(["git", "commit", "-m", "full autonomous wired system build"])
subprocess.run(["git", "push"])

print("\n🚀 Done. Vercel will auto-deploy.")
