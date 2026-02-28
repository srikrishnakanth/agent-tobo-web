import { advanceStage } from "../state/stage-machine"
import { SessionState } from "../state/session-types"

function nextQuestion(session: SessionState): string {
  const s = session.scope

  if (!s.businessName)
    return "What is your business name?"

  if (!s.platforms || s.platforms.length === 0)
    return "Which platform do you need? (web / android / ios)"

  if (!s.features || s.features.length === 0)
    return "List key features separated by comma."

  return "All requirements captured."
}

export function runAutonomousCycle(session: SessionState) {
  const question = nextQuestion(session)

  if (question === "All requirements captured.") {
    const nextStage = advanceStage(session)
    return {
      nextStage,
      question: "Moving to next stage...",
    }
  }

  return {
    nextStage: session.stage,
    question,
  }
}
