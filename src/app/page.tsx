
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
