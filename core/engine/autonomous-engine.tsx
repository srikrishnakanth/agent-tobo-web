import { advanceStage } from "../state/stage-machine"
import { SessionState } from "../state/session-types"

export function runAutonomousCycle(session: SessionState) {
  const nextStage = advanceStage(session)

  return {
    previousStage: session.stage,
    nextStage,
  }
}

