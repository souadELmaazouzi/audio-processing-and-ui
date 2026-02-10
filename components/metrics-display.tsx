"use client"

interface Metrics {
  duration: number
  rms: number
  centroid: number
  rolloff: number
  distance: number
}

interface MetricsDisplayProps {
  conditions: Record<string, Metrics>
}

export default function MetricsDisplay({ conditions }: MetricsDisplayProps) {
  const conditionLabels = {
    human: { name: "Human", icon: "🎤" },
    speaker_0m: { name: "Speaker 0m", icon: "🔊" },
    speaker_3m: { name: "Speaker 3m", icon: "📢" },
  }

  return (
    <div className="space-y-4">
      {Object.entries(conditions).map(([key, metrics]) => {
        const label = conditionLabels[key as keyof typeof conditionLabels]
        return (
          <div key={key} className="border border-border rounded-lg p-4 bg-background/50">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">{label.icon}</span>
              <h3 className="font-semibold text-foreground">{label.name}</h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <MetricBox label="Duration" value={metrics.duration.toFixed(2)} unit="s" />
              <MetricBox label="RMS" value={metrics.rms.toFixed(6)} unit="" />
              <MetricBox label="Centroid" value={metrics.centroid.toFixed(1)} unit="Hz" />
              <MetricBox label="Rolloff" value={metrics.rolloff.toFixed(1)} unit="Hz" />
              <MetricBox label="Distance" value={metrics.distance.toString()} unit="m" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MetricBox({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-foreground">
        {value}
        <span className="text-xs ml-1">{unit}</span>
      </p>
    </div>
  )
}
