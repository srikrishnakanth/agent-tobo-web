
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
