import { type NextRequest, NextResponse } from "next/server"
import * as path from "path"
import { spawn } from "child_process"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  let pythonProcess: ReturnType<typeof spawn> | null = null

  try {
    const body = await request.json()

    const dataRoot =
      process.env.DATA_ROOT || path.join(process.cwd(), "loudspeaker_asr_dataset")

    const pythonBin =
      process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3")

    const scriptPath =
      process.env.EVAL_SCRIPT || path.join(process.cwd(), "scripts", "evaluate.py")

    const voskPath =
      process.env.VOSK_PATH ||
      path.join(process.cwd(), "models", "vosk-model-small-en-us-0.15")

    // Logs utiles (tu vas voir les chemins dans le terminal Next)
    console.log("[evaluate] pythonBin:", pythonBin)
    console.log("[evaluate] scriptPath:", scriptPath)
    console.log("[evaluate] dataRoot:", dataRoot)
    console.log("[evaluate] voskPath:", voskPath)

    const requestData = {
      eqMode: body.eqMode ?? "none",
      doEq: Boolean(body.doEq),
      asrBackend: body.asrBackend ?? "whisper",
      asrOnCondition: body.asrOnCondition ?? "speaker_3m",
      dataRoot,
    }

    pythonProcess = spawn(pythonBin, [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env, DATA_ROOT: dataRoot, VOSK_PATH: voskPath },
      stdio: ["pipe", "pipe", "pipe"],
    })

    if (!pythonProcess.stdin || !pythonProcess.stdout || !pythonProcess.stderr) {
      return NextResponse.json(
        { error: "Failed to start python process with piped stdio." },
        { status: 500 }
      )
    }

    let stdoutData = ""
    let stderrData = ""

    pythonProcess.stdout.setEncoding("utf8")
    pythonProcess.stderr.setEncoding("utf8")

    pythonProcess.stdout.on("data", (chunk) => (stdoutData += chunk))
    pythonProcess.stderr.on("data", (chunk) => (stderrData += chunk))

    pythonProcess.stdin.write(JSON.stringify(requestData))
    pythonProcess.stdin.end()

    await new Promise<void>((resolve, reject) => {
      pythonProcess!.on("close", () => resolve())
      pythonProcess!.on("error", reject)
    })

    // stdout doit être JSON
    let result: any
    try {
      result = JSON.parse(stdoutData)
    } catch {
      return NextResponse.json(
        {
          error: "Python stdout is not valid JSON",
          stdout: stdoutData.slice(0, 2000),
          stderr: stderrData.slice(0, 4000),
        },
        { status: 500 }
      )
    }

    // IMPORTANT: python peut renvoyer {error:"..."} avec exit code 0
    if (result?.error) {
      return NextResponse.json(
        { error: result.error, logs: result.logs || "", stderr: stderrData.slice(0, 4000) },
        { status: 500 }
      )
    }

    // Renvoie stderr comme logs si python n'a pas logs
    if (!result.logs) result.logs = stderrData

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 })
  } finally {
    try {
      pythonProcess?.kill("SIGKILL")
    } catch {}
  }
}
