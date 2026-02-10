"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Play, Pause } from "lucide-react"
import { useState, useRef } from "react"

interface AudioPlayerProps {
  src: string
  condition: string
  label: string
  icon: string
}

export default function AudioPlayer({ src, condition, label, icon }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const handlePlayPause = () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  return (
    <Card className="border border-border bg-gradient-to-br from-card to-card/50 p-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{icon}</span>
          <div>
            <p className="font-semibold text-foreground">{condition}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>

        <div className="w-full h-12 rounded-lg bg-background border border-border flex items-center justify-center">
          <div className="flex gap-1">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="flex-1 h-8 rounded-sm bg-gradient-to-t from-primary to-primary/50 opacity-70"
                style={{
                  height: `${Math.random() * 100}%`,
                  animation: isPlaying ? "pulse 0.3s ease-in-out" : "none",
                }}
              />
            ))}
          </div>
        </div>

        <audio ref={audioRef} src={src} onEnded={() => setIsPlaying(false)} />

        <Button
          onClick={handlePlayPause}
          size="sm"
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isPlaying ? (
            <>
              <Pause className="h-4 w-4 mr-2" /> Pause
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" /> Play
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}
