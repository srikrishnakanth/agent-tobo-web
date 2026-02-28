
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
