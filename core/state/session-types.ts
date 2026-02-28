export type Stage =
  | "LOAD"
  | "VOICE_INTRO"
  | "APP_TYPE"
  | "REQUIREMENTS"
  | "HOSTING"
  | "PLAN"
  | "AGREEMENT"
  | "PAYMENT"
  | "DASHBOARD"

export interface ProjectScope {
  businessName?: string
  platforms?: ("web" | "android" | "ios")[]
  features?: string[]
  userRoles?: string[]
}

export interface SessionState {
  projectId: string
  stage: Stage
  scope: ProjectScope
}
