
import { NextResponse } from "next/server"
import { runAutonomous } from "../../../../core/engine/autonomous-engine"

export async function POST(req: Request) {
  const body = await req.json()
  const result = runAutonomous(body)
  return NextResponse.json(result)
}
