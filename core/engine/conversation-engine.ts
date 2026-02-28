
import { SessionState } from "../state/session-types"

export function getNextQuestion(session: SessionState): string {
  const s = session.scope

  if (!s.businessName) return "What is your business name?"
  if (!s.platforms) return "Which platforms? (web, android, ios)"
  if (!s.features) return "List main features separated by comma."

  return "Requirements captured."
}
