"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, AlertCircle, CheckCircle2, XCircle } from "lucide-react"

const EQ_PROFILES = ["none", "rock", "pop", "jazz", "classic"] as const
const ASR_BACKENDS = ["whisper", "wav2vec2", "vosk"] as const
type Backend = (typeof ASR_BACKENDS)[number]
type Status = "idle" | "loading" | "success" | "error"

type BackendResult = {
  detailed: any[]
  summary: any[]
  plotData: string
  logs: string
}

function safeMean(arr: any[], key: string) {
  const vals = arr.map((x) => Number(x?.[key])).filter((v) => Number.isFinite(v))
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export default function QuantitativeEval() {
  const [eqMode, setEqMode] = useState<(typeof EQ_PROFILES)[number]>("none")
  const [applyEq, setApplyEq] = useState(false)
  const [condition, setCondition] = useState("speaker_3m")
  const [globalError, setGlobalError] = useState("")
  const [loadingAll, setLoadingAll] = useState(false)

  const [status, setStatus] = useState<Record<Backend, Status>>({
    whisper: "idle",
    wav2vec2: "idle",
    vosk: "idle",
  })

  const [errors, setErrors] = useState<Record<Backend, string>>({
    whisper: "",
    wav2vec2: "",
    vosk: "",
  })

  const [results, setResults] = useState<Record<Backend, BackendResult | null>>({
    whisper: null,
    wav2vec2: null,
    vosk: null,
  })

  const abortRef = useRef<AbortController | null>(null)

  const reset = () => {
    abortRef.current?.abort()
    setGlobalError("")
    setLoadingAll(false)
    setStatus({ whisper: "idle", wav2vec2: "idle", vosk: "idle" })
    setErrors({ whisper: "", wav2vec2: "", vosk: "" })
    setResults({ whisper: null, wav2vec2: null, vosk: null })
  }

  const runOne = async (backend: Backend, signal: AbortSignal) => {
    const resp = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eqMode,
        doEq: applyEq,
        asrOnCondition: condition,
        asrBackend: backend,
      }),
      signal,
    })

    const data = await resp.json().catch(() => ({}))

    if (!resp.ok || data?.error) {
      throw new Error(data?.error || `Evaluation failed for ${backend}`)
    }

    return {
      detailed: data.detailedResults || [],
      summary: data.summary || [],
      plotData: data.plotData ? `data:image/png;base64,${data.plotData}` : "",
      logs: data.logs || "",
    } as BackendResult
  }

  const handleEvaluate = async () => {
    // Cancel previous run if any
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
  
    // Reset UI state
    setGlobalError("")
    setLoadingAll(true)
    setErrors({ whisper: "", wav2vec2: "", vosk: "" })
    setStatus({ whisper: "loading", wav2vec2: "loading", vosk: "loading" })
    setResults({ whisper: null, wav2vec2: null, vosk: null })
  
    // Helper: call API + ALWAYS surface logs/stderr when failing
    const runOneWithLogs = async (backend: "whisper" | "wav2vec2" | "vosk") => {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eqMode,
          doEq: applyEq,
          asrOnCondition: condition,
          asrBackend: backend,
        }),
        signal: controller.signal,
      })
  
      let data: any
      try {
        data = await response.json()
      } catch {
        // Non-JSON response
        throw new Error(`Backend ${backend}: réponse non-JSON`)
      }
  
      // If API returned error or non-200
      if (!response.ok || data?.error) {
        const msg = data?.error || `Evaluation failed for ${backend}`
        const extra = data?.logs || data?.stderr || data?.details || ""
        // Put backend name in the message so you can identify it easily
        throw new Error(extra ? `[${backend}] ${msg}\n\n${extra}` : `[${backend}] ${msg}`)
      }
  
      return {
        detailed: data.detailedResults || [],
        summary: data.summary || [],
        plotData: data.plotData ? `data:image/png;base64,${data.plotData}` : "",
        logs: data.logs || data.stderr || "",
      }
    }
  
    // Run all backends (don’t rely on React state timing)
    const settled = await Promise.allSettled(
      ASR_BACKENDS.map(async (backend) => {
        try {
          const res = await runOneWithLogs(backend)
          return { backend, ok: true as const, res }
        } catch (e: any) {
          if (e?.name === "AbortError") throw e
          return { backend, ok: false as const, error: e?.message || "Error" }
        }
      })
    )
  
    let anyOk = false
  
    for (const s of settled) {
      if (s.status !== "fulfilled") continue
      const r = s.value
  
      if (r.ok) {
        anyOk = true
        setResults((prev) => ({ ...prev, [r.backend]: r.res }))
        setStatus((prev) => ({ ...prev, [r.backend]: "success" }))
      } else {
        setErrors((prev) => ({ ...prev, [r.backend]: r.error }))
        setStatus((prev) => ({ ...prev, [r.backend]: "error" }))
      }
    }
  
    setLoadingAll(false)
  
    if (!anyOk) {
      setGlobalError(
        "Tous les backends ont échoué. Ouvre Network → /api/evaluate → Response pour voir l’erreur exacte (error/logs/stderr)."
      )
    }
  }
  

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card className="border border-border">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-lg">Evaluation Settings</CardTitle>
          <div className="flex gap-2">
            <Badge variant={applyEq ? "default" : "secondary"}>{applyEq ? `EQ: ${eqMode}` : "EQ: off"}</Badge>
            <Badge variant="outline">{condition}</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">EQ Preset</Label>
              <Select value={eqMode} onValueChange={(v) => setEqMode(v as any)} disabled={loadingAll}>
                <SelectTrigger className="w-full bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQ_PROFILES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Evaluate on Condition</Label>
              <Select value={condition} onValueChange={setCondition} disabled={loadingAll}>
                <SelectTrigger className="w-full bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="speaker_0m">Speaker 0m</SelectItem>
                  <SelectItem value="speaker_3m">Speaker 3m</SelectItem>
                  <SelectItem value="human">Human</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-3 rounded-lg border border-border p-3 bg-background/50">
            <Checkbox id="eval-eq" checked={applyEq} onCheckedChange={(e) => setApplyEq(Boolean(e))} disabled={loadingAll} />
            <Label htmlFor="eval-eq" className="text-sm font-medium cursor-pointer">
              Apply EQ during evaluation
            </Label>
          </div>

          {globalError && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{globalError}</p>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-3">
            <Button onClick={handleEvaluate} disabled={loadingAll} size="lg" className="w-full">
              {loadingAll && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loadingAll ? "Evaluating..." : "📊 Run Quantitative Evaluation"}
            </Button>

            <Button onClick={reset} disabled={loadingAll} size="lg" variant="outline" className="w-full">
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Always show cards */}
      {ASR_BACKENDS.map((backend) => {
        const res = results[backend]
        const st = status[backend]
        const err = errors[backend]

        return (
          <Card key={backend} className="border border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                Results: {backend.toUpperCase()}
                {st === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
                {st === "success" && <CheckCircle2 className="h-4 w-4" />}
                {st === "error" && <XCircle className="h-4 w-4 text-destructive" />}
              </CardTitle>
            </CardHeader>

            <CardContent>
              {st === "error" && (
                <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{err || "Backend failed"}</p>
                </div>
              )}

              {!res && st !== "loading" && st !== "error" && (
                <p className="text-sm text-muted-foreground">No results yet.</p>
              )}

              {!res && st === "loading" && (
                <p className="text-sm text-muted-foreground">Running {backend}…</p>
              )}

              {res && (
                <>
                  {/* Summary means */}
                  {res.summary?.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <StatBox label="Mean CER" value={safeMean(res.summary, "CER")} />
                      <StatBox label="Mean WER" value={safeMean(res.summary, "WER")} />
                      <StatBox label="Mean RMS" value={safeMean(res.summary, "RMS")} />
                    </div>
                  )}
                  {res.summary?.length > 0 && (
  <div className="overflow-x-auto mb-4">
    <table className="w-full text-xs md:text-sm">
      <thead className="border-b border-border bg-background/50">
        <tr>
          <th className="text-left py-2 px-2">Distance (m)</th>
          <th className="text-left py-2 px-2">CER</th>
          <th className="text-left py-2 px-2">WER</th>
          <th className="text-left py-2 px-2">RMS</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {res.summary.map((row: any, i: number) => (
          <tr key={i}>
            <td className="py-1 px-2">{row.distance_m}</td>
            <td className="py-1 px-2 font-mono">{Number(row.CER).toFixed(4)}</td>
            <td className="py-1 px-2 font-mono">{Number(row.WER).toFixed(4)}</td>
            <td className="py-1 px-2 font-mono">{Number(row.RMS).toFixed(6)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}

                  {res.plotData && <img src={res.plotData} className="w-full rounded-lg border border-border mb-4" alt="plot" />}

                  {res.detailed?.length > 0 && (
                    <div className="overflow-x-auto mb-4">
                      <table className="w-full text-xs md:text-sm">
                        <thead className="border-b border-border bg-background/50">
                          <tr>
                            <th className="text-left py-2 px-2">Utterance</th>
                            <th className="text-left py-2 px-2">Distance</th>
                            <th className="text-left py-2 px-2">CER</th>
                            <th className="text-left py-2 px-2">WER</th>
                            <th className="text-left py-2 px-2">RMS</th>
                            <th className="text-left py-2 px-2">Centroid</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {res.detailed.map((row: any, idx: number) => (
                            <tr key={`${row?.utt_id ?? "utt"}-${idx}`}>
                              <td className="py-1 px-2 font-mono">{row?.utt_id ?? "-"}</td>
                              <td className="py-1 px-2">{row?.distance_m ?? "-"}m</td>
                              <td className="py-1 px-2 font-mono">{Number(row?.CER ?? 0).toFixed(4)}</td>
                              <td className="py-1 px-2 font-mono">{Number(row?.WER ?? 0).toFixed(4)}</td>
                              <td className="py-1 px-2 font-mono">{Number(row?.RMS ?? 0).toFixed(6)}</td>
                              <td className="py-1 px-2 font-mono">{Number(row?.centroid ?? 0).toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {res.logs && (
                    <pre className="text-xs bg-background border border-border rounded-lg p-2 overflow-x-auto">
                      {res.logs}
                    </pre>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-sm font-medium text-muted-foreground mb-2">{label}</p>
      <p className="text-3xl font-bold text-foreground font-mono">{value === null ? "—" : value.toFixed(4)}</p>
    </div>
  )
}
