"use client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import InteractiveComparison from "@/components/interactive-comparison"
import QuantitativeEval from "@/components/quantitative-eval"

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <span className="text-4xl">🎙️</span>
                Audio ASR Analysis
              </h1>
              <p className="text-muted-foreground mt-1">
                Loudspeaker Dataset: Human vs Speaker (0m/3m) + Whisper Transcription
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="interactive" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="interactive" className="flex items-center gap-2">
              <span>🔹</span> Interactive Comparison
            </TabsTrigger>
            <TabsTrigger value="quantitative" className="flex items-center gap-2">
              <span>📊</span> Quantitative Evaluation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="interactive" className="space-y-6">
            <Card className="border border-border bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Per-Utterance Analysis</CardTitle>
                <CardDescription>Load and compare audio from different recording conditions</CardDescription>
              </CardHeader>
              <CardContent>
                <InteractiveComparison />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quantitative" className="space-y-6">
            <Card className="border border-border bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Quantitative Evaluation</CardTitle>
                <CardDescription>Batch evaluate ASR performance with CER/WER metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <QuantitativeEval />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
