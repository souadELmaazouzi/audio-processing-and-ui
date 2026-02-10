"use client"

import { Card } from "@/components/ui/card"

interface SpectrogramPlotProps {
  title: string
  condition: "human" | "speaker_0m" | "speaker_3m"
}

export default function SpectrogramPlot({ title, condition }: SpectrogramPlotProps) {
  // Generate a simulated spectrogram visualization
  const generateSpectrogram = () => {
    const rows = 50
    const cols = 100
    const data: number[][] = []

    for (let i = 0; i < rows; i++) {
      const row: number[] = []
      for (let j = 0; j < cols; j++) {
        // Create a pattern that simulates audio features
        const freq = Math.sin(j / 20) * Math.sin(i / 10)
        const energy = Math.abs(freq) * (1 - Math.abs(i - rows / 2) / rows)
        row.push(Math.max(0, energy))
      }
      data.push(row)
    }
    return data
  }

  const spectrogramData = generateSpectrogram()
  const maxValue = Math.max(...spectrogramData.flat())

  const getColor = (value: number) => {
    const normalized = value / maxValue
    if (normalized < 0.2) return "#000033"
    if (normalized < 0.4) return "#000055"
    if (normalized < 0.6) return "#0000FF"
    if (normalized < 0.8) return "#00FF00"
    return "#FFFF00"
  }

  return (
    <Card className="border border-border bg-card p-4">
      <h4 className="font-semibold text-foreground mb-3">{title}</h4>

      <div className="bg-background rounded-lg p-2 border border-border overflow-x-auto">
        <div className="space-y-px inline-block">
          {spectrogramData.map((row, i) => (
            <div key={i} className="flex gap-px">
              {row.map((value, j) => (
                <div key={`${i}-${j}`} className="w-1 h-1" style={{ backgroundColor: getColor(value) }} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Time →</span>
        <span>Frequency →</span>
      </div>
    </Card>
  )
}
