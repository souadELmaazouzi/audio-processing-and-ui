import { type NextRequest, NextResponse } from "next/server"
import * as path from "path"
import { spawn } from "child_process"

interface AnalyzeRequest {
  uttId: string
  eqMode: string
  doEq: boolean
  transcribeOn: boolean
  transcriberCond: string
}

interface AnalyzeResponse {
  audioHuman: string // base64
  audio0m: string
  audio3m: string
  refText: string
  hypText: string
  measures: string
  logs: string
}

/**
 * POST /api/analyze
 * Calls the Python backend to analyze a single utterance
 */
export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json()

    const dataRoot = process.env.DATA_ROOT || path.join(process.cwd(), "loudspeaker_asr_dataset")
    const pythonPath = path.join(process.cwd(), "venv", "bin", "python")

    const pythonProcess = spawn(pythonPath, [path.join(process.cwd(), "scripts", "analyze.py")])

    let output = ""
    let errorOutput = ""

    pythonProcess.stdout.on("data", (data) => {
      output += data.toString()
    })

    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString()
    })

    const requestData = {
      ...body,
      dataRoot,
    }

    pythonProcess.stdin.write(JSON.stringify(requestData))
    pythonProcess.stdin.end()

    await new Promise<void>((resolve, reject) => {
      pythonProcess.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}: ${errorOutput}`))
        } else {
          resolve()
        }
      })
      pythonProcess.on("error", reject)
    })

    const result: AnalyzeResponse = JSON.parse(output)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[API] Analyze error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
