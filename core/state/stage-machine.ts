import { Stage, SessionState } from "./session-types"

export function advanceStage(session: SessionState): Stage {
  switch (session.stage) {
    case "LOAD":
      return "VOICE_INTRO"
    case "VOICE_INTRO":
      return "APP_TYPE"
    case "APP_TYPE":
      return "REQUIREMENTS"
    case "REQUIREMENTS":
      return "HOSTING"
    case "HOSTING":
      return "PLAN"
    case "PLAN":
      return "AGREEMENT"
    case "AGREEMENT":
      return "PAYMENT"
    case "PAYMENT":
      return "DASHBOARD"
    default:
      return session.stage
  }
}
