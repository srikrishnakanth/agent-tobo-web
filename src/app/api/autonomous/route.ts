import { NextResponse } from "next/server"
import { runAutonomousCycle } from "../../../../core/engine/autonomous-engine"

export async function POST(req: Request) {
  const body = await req.json()

  const result = runAutonomousCycle({
    projectId: body.projectId || "default",
    stage: body.stage,
    scope: body.scope || {},
  })

  return NextResponse.json(result)
}

