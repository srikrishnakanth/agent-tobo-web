import { NextResponse } from "next/server"
import { runAutonomousCycle } from "../../../../core/engine/autonomous-engine"

export async function GET() {
  const result = runAutonomousCycle({
    projectId: "demo",
    stage: "LOAD",
    scope: {},
  })

  return NextResponse.json(result)
}
