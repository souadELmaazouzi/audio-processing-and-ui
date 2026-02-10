"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import AudioPlayer from "./audio-player"
import { Loader2, AlertCircle } from "lucide-react"

const EQ_PROFILES = ["none", "rock", "pop", "jazz", "classic"]

export default function InteractiveComparison() {
  const [uttIds, setUttIds] = useState<string[]>([])
  const [selectedUtt, setSelectedUtt] = useState("")
  const [eqMode, setEqMode] = useState("none")
  const [applyEq, setApplyEq] = useState(false)
  const [transcribeOn, setTranscribeOn] = useState(true)
  const [transcribeCond, setTranscribeCond] = useState("speaker_3m")
  const [loading, setLoading] = useState(false)
  const [loadingMetadata, setLoadingMetadata] = useState(true)
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const response = await fetch("/api/metadata")
        if (!response.ok) throw new Error("Failed to load metadata")
        const data = await response.json()
        setUttIds(data.uttIds || [])
        if (data.uttIds?.length > 0) {
          setSelectedUtt(data.uttIds[0])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load utterances")
      } finally {
        setLoadingMetadata(false)
      }
    }
    fetchMetadata()
  }, [])

  const handleAnalyze = async () => {
    if (!selectedUtt) return

    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uttId: selectedUtt,
          eqMode,
          doEq: applyEq,
          transcribeOn,
          transcriberCond: transcribeCond,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Analysis failed")
      }

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      const audioHuman = data.audioHuman ? `data:audio/wav;base64,${data.audioHuman}` : ""
      const audio0m = data.audio0m ? `data:audio/wav;base64,${data.audio0m}` : ""
      const audio3m = data.audio3m ? `data:audio/wav;base64,${data.audio3m}` : ""

      setResults({
        audioHuman,
        audio0m,
        audio3m,
        refText: data.refText,
        prediction: data.hypText,
        measures: data.measures,
        logs: data.logs,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      console.error("[v0] Analysis error:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-lg">Analysis Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Utterance Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Utterance ID</Label>
              {loadingMetadata ? (
                <div className="h-10 bg-muted rounded-lg flex items-center px-3">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Loading...</span>
                </div>
              ) : (
                <Select value={selectedUtt} onValueChange={setSelectedUtt}>
                  <SelectTrigger className="w-full bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {uttIds.map((id) => (
                      <SelectItem key={id} value={id}>
                        {id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* EQ Mode */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Equalizer Preset</Label>
              <Select value={eqMode} onValueChange={setEqMode}>
                <SelectTrigger className="w-full bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQ_PROFILES.map((profile) => (
                    <SelectItem key={profile} value={profile}>
                      {profile.charAt(0).toUpperCase() + profile.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-3 rounded-lg border border-border p-3 bg-background/50">
              <Checkbox id="apply-eq" checked={applyEq} onCheckedChange={(e) => setApplyEq(e as boolean)} />
              <Label htmlFor="apply-eq" className="text-sm font-medium cursor-pointer">
                Apply EQ to audio
              </Label>
            </div>

            <div className="flex items-center space-x-3 rounded-lg border border-border p-3 bg-background/50">
              <Checkbox id="transcribe" checked={transcribeOn} onCheckedChange={(e) => setTranscribeOn(e as boolean)} />
              <Label htmlFor="transcribe" className="text-sm font-medium cursor-pointer">
                Transcribe with Whisper
              </Label>
            </div>
          </div>

          {transcribeOn && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Transcribe on condition</Label>
              <div className="grid grid-cols-3 gap-3">
                {(["speaker_0m", "speaker_3m", "human"] as const).map((cond) => (
                  <button
                    key={cond}
                    onClick={() => setTranscribeCond(cond)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      transcribeCond === cond
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {cond === "speaker_0m" ? "0m" : cond === "speaker_3m" ? "3m" : "Human"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Analyze Button */}
          <Button
            onClick={handleAnalyze}
            disabled={loading || !selectedUtt}
            size="lg"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? "Analyzing..." : "▶️ Load & Compare"}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <>
          {/* Audio Players */}
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-lg">🎤 Audio Players</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {results.audioHuman && (
                  <AudioPlayer src={results.audioHuman} condition="Human" label="Reference Recording" icon="🎤" />
                )}
                {results.audio0m && (
                  <AudioPlayer src={results.audio0m} condition="Speaker 0m" label="Speaker at 0m" icon="🔊" />
                )}
                {results.audio3m && (
                  <AudioPlayer src={results.audio3m} condition="Speaker 3m" label="Speaker at 3m" icon="📢" />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Reference Text */}
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-lg">📝 Text Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-muted-foreground">Reference Text (Human)</Label>
                  <div className="p-4 rounded-lg bg-background border border-border min-h-[80px]">
                    <p className="text-foreground">{results.refText}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-muted-foreground">Whisper Transcription</Label>
                  <div className="p-4 rounded-lg bg-background border border-border min-h-[80px]">
                    <p className="text-foreground">{results.prediction}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Measures */}
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-lg">📏 Metrics & Errors</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-background border border-border rounded-lg p-4 overflow-x-auto">
                <code className="text-foreground whitespace-pre-wrap">{results.measures}</code>
              </pre>
            </CardContent>
          </Card>

          {/* Debug Logs */}
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-lg">🪵 Debug Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-background border border-border rounded-lg p-4 overflow-x-auto">
                <code className="text-foreground whitespace-pre-wrap">{results.logs}</code>
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
