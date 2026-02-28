import { NextResponse } from "next/server"
import { runAutonomous } from "../../../../core/engine/autonomous-engine"

export async function POST(req: Request) {
  const body = await req.json()

  const result = runAutonomous({
    projectId: body.projectId || "default",
    stage: body.stage,
    scope: body.scope || {},
  })

  return NextResponse.json(result)
}
}

