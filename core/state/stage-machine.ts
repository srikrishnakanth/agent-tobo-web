
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
