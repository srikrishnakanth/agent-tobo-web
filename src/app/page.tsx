"use client"

import { useState, useEffect, useRef } from "react"

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

type Message = {
  sender: "user" | "system"
  text: string
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("LOAD")
  const [scope, setScope] = useState<any>({})
  const [messages, setMessages] = useState<Message[]>([
    { sender: "system", text: "Welcome to Agent Tobo. Click Start to begin." },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function start() {
    await sendMessage("")
  }

  async function sendMessage(userInput: string) {
    setLoading(true)

    let updatedScope = { ...scope }

    if (!scope.businessName) {
      updatedScope.businessName = userInput
    } else if (!scope.platforms) {
      updatedScope.platforms = [userInput]
    } else if (!scope.features) {
      updatedScope.features = userInput
        .split(",")
        .map((f) => f.trim())
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

    const newMessages: Message[] = []

    if (userInput) {
      newMessages.push({ sender: "user", text: userInput })
    }

    newMessages.push({ sender: "system", text: data.question })

    setMessages((prev) => [...prev, ...newMessages])
    setScope(updatedScope)
    setStage(data.nextStage)
    setInput("")
    setLoading(false)
  }

  return (
    <main className="flex flex-col h-screen bg-gray-100">
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`max-w-xs px-4 py-2 rounded-lg ${
              msg.sender === "system"
                ? "bg-white text-black"
                : "bg-black text-white ml-auto"
            }`}
          >
            {msg.text}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 bg-white border-t flex gap-2">
        {messages.length === 1 ? (
          <button
            onClick={start}
            className="w-full py-3 bg-black text-white rounded"
          >
            Start
          </button>
        ) : (
          <>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 border p-2 rounded"
              placeholder="Type your response..."
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading}
              className="px-4 bg-black text-white rounded"
            >
              Send
            </button>
          </>
        )}
      </div>
    </main>
  )
}
