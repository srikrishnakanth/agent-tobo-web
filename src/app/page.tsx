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
  const [response, setResponse] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function advance() {
    setLoading(true)

    const res = await fetch("/api/autonomous", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: "demo",
        stage,
        scope: {},
      }),
    })

    const data = await res.json()

    setStage(data.nextStage)
    setResponse(data)
    setLoading(false)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">Agent Tobo Autonomous Engine</h1>

      <div className="border p-4 rounded w-full max-w-md text-center">
        <p className="text-lg">
          Current Stage: <strong>{stage}</strong>
        </p>
      </div>

      <button
        onClick={advance}
        disabled={loading}
        className="px-6 py-3 bg-black text-white rounded"
      >
        {loading ? "Processing..." : "Advance Stage"}
      </button>

      {response && (
        <pre className="bg-gray-100 p-4 rounded w-full max-w-md overflow-auto text-sm">
          {JSON.stringify(response, null, 2)}
        </pre>
      )}
    </main>
  )
}
