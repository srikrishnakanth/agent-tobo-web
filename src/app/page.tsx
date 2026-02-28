"use client"

import { useState } from "react"

type Stage =
  | "LOAD"
  | "VOICE_INTRO"
  | "APP_TYPE"
  | "REQUIREMENTS"
  | "HOSTING"
  | "PLAN"
  | "AGREEMENT"
  | "PAYMENT"
  | "DASHBOARD"

export default function Home() {
  const [stage, setStage] = useState<Stage>("LOAD")
  const [scope, setScope] = useState<any>({})
  const [question, setQuestion] = useState("Click Start to begin")
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)

  async function send() {
    setLoading(true)

    let updatedScope = { ...scope }

    if (!scope.businessName) {
      updatedScope.businessName = input
    } else if (!scope.platforms) {
      updatedScope.platforms = [input]
    } else if (!scope.features) {
      updatedScope.features = input.split(",").map((f) => f.trim())
    }

    const res = await fetch("/api/autonomous", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "demo",
        stage,
        scope: updatedScope,
      }),
    })

    const data = await res.json()

    setScope(updatedScope)
    setStage(data.nextStage)
    setQuestion(data.question)
    setInput("")
    setLoading(false)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">Agent Tobo Autonomous Engine</h1>

      <div className="border p-4 rounded w-full max-w-md">
        <p className="mb-2 text-sm text-gray-500">Stage: {stage}</p>
        <p className="font-medium">{question}</p>
      </div>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="border p-2 rounded w-full max-w-md"
        placeholder="Type your answer..."
      />

      <button
        onClick={send}
        disabled={loading}
        className="px-6 py-3 bg-black text-white rounded"
      >
        {loading ? "Processing..." : "Send"}
      </button>

      <pre className="bg-gray-100 p-4 rounded w-full max-w-md text-xs overflow-auto">
        {JSON.stringify(scope, null, 2)}
      </pre>
    </main>
  )
}
