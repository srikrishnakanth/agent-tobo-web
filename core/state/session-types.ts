
export type Stage =
  | "LOAD"
  | "REQUIREMENTS"
  | "PRICING"
  | "AGREEMENT"
  | "PAYMENT"
  | "DASHBOARD"

export interface ProjectScope {
  businessName?: string
  platforms?: string[]
  features?: string[]
}

export interface SessionState {
  stage: Stage
  scope: ProjectScope
}
