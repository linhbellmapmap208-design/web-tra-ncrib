'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Midi } from '@tonejs/midi'
import { Download, Loader2, Pause, Play, RotateCcw } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ToneModule = typeof import('tone')
type RollNote = { midi: number; time: number; duration: number; velocity: number }

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function MidiResult({
  midi,
  fileName,
  onReset,
}: {
  midi: ArrayBuffer
  fileName: string
  onReset: () => void
}) {
  const parsed = useMemo(() => {
    const m = new Midi(midi)
    const notes: RollNote[] = m.tracks.flatMap((t) =>
      t.notes.map((n) => ({ midi: n.midi, time: n.time, duration: n.duration, velocity: n.velocity })),
    )
    const pedals = m.tracks.reduce(
      (sum, t) => sum + (t.controlChanges[64]?.filter((c) => c.value >= 0.5).length ?? 0),
      0,
    )
    return { notes, duration: m.duration, pedals }
  }, [midi])

  const downloadUrl = useMemo(
    () => URL.createObjectURL(new Blob([midi], { type: 'audio/midi' })),
    [midi],
  )
  useEffect(() => () => URL.revokeObjectURL(downloadUrl), [downloadUrl])

  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [position, setPosition] = useState(0)
  const toneRef = useRef<ToneModule | null>(null)
  const samplerRef = useRef<import('tone').Sampler | null>(null)
  const partRef = useRef<import('tone').Part | null>(null)
  const rafRef = useRef<number | null>(null)

  function stop(resetPosition = true) {
    const Tone = toneRef.current
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    if (Tone) {
      const transport = Tone.getTransport()
      transport.stop()
      transport.cancel()
    }
    partRef.current?.dispose()
    partRef.current = null
    samplerRef.current?.releaseAll()
    setPlaying(false)
    if (resetPosition) setPosition(0)
  }

  useEffect(() => {
    return () => {
      stop(false)
      samplerRef.current?.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function play() {
    setLoading(true)
    try {
      const Tone = toneRef.current ?? (await import('tone'))
      toneRef.current = Tone
      await Tone.start()
      if (!samplerRef.current) {
        const sampler = new Tone.Sampler({
          urls: {
            A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3', A1: 'A1.mp3',
            C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3', A2: 'A2.mp3', C3: 'C3.mp3',
            'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3', A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3',
            'F#4': 'Fs4.mp3', A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
            A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3', A6: 'A6.mp3',
            C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3', A7: 'A7.mp3', C8: 'C8.mp3',
          },
          release: 1,
          baseUrl: 'https://tonejs.github.io/audio/salamander/',
        }).toDestination()
        samplerRef.current = sampler
        await Tone.loaded()
      }
      const sampler = samplerRef.current
      const transport = Tone.getTransport()
      const part = new Tone.Part((time, n: RollNote) => {
        sampler.triggerAttackRelease(
          Tone.Frequency(n.midi, 'midi').toNote(),
          Math.max(0.05, n.duration),
          time,
          n.velocity,
        )
      }, parsed.notes.map((n) => [n.time, n] as [number, RollNote]))
      part.start(0)
      partRef.current = part

      const offset = position >= parsed.duration ? 0 : position
      transport.start(undefined, offset)
      setPlaying(true)

      const tick = () => {
        const t = transport.seconds
        if (t >= parsed.duration + 0.5) {
          stop()
          return
        }
        setPosition(t)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } finally {
      setLoading(false)
    }
  }

  function pause() {
    const current = position
    stop(false)
    setPosition(current)
  }

  const stats = [
    { label: 'Số nốt', value: parsed.notes.length.toLocaleString('vi-VN') },
    { label: 'Thời lượng', value: formatTime(parsed.duration) },
    { label: 'Pedal', value: parsed.pedals.toLocaleString('vi-VN') },
  ]

  const progress = parsed.duration > 0 ? Math.min(1, position / parsed.duration) : 0

  return (
    <section aria-labelledby="result-heading" className="flex flex-col gap-5 rounded-xl border border-border p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="result-heading" className="text-sm font-medium">
          Kết quả MIDI
        </h2>
        <p className="truncate font-mono text-xs text-muted-foreground">{fileName}</p>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-border border-y border-border">
        {stats.map((s) => (
          <div key={s.label} className="px-3 py-3 first:pl-0">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="mt-1 font-mono text-base">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex items-center gap-3">
        <Button
          size="icon-lg"
          onClick={playing ? pause : play}
          disabled={loading || parsed.notes.length === 0}
          aria-label={playing ? 'Tạm dừng' : 'Phát MIDI'}
          className="shrink-0 rounded-full"
        >
          {loading ? <Loader2 className="animate-spin" /> : playing ? <Pause /> : <Play />}
        </Button>
        <div
          className="h-px flex-1 bg-border"
          role="progressbar"
          aria-label="Vị trí phát"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div className="h-full bg-foreground" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {formatTime(position)} / {formatTime(parsed.duration)}
        </span>
      </div>

      <div className="flex gap-2">
        <a
          href={downloadUrl}
          download={fileName}
          className={cn(buttonVariants({ size: 'lg' }), 'flex-1')}
        >
          <Download data-icon="inline-start" />
          Tải MIDI
        </a>
        <Button variant="outline" size="lg" onClick={onReset}>
          <RotateCcw data-icon="inline-start" />
          File khác
        </Button>
      </div>
    </section>
  )
}
