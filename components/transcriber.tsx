'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, FileAudio, Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MidiResult } from '@/components/midi-result'
import { ServerStatus } from '@/components/server-status'
import { transcribeToMidi, type TranscribeProgress } from '@/lib/transkun'
import { cn } from '@/lib/utils'

const MAX_BYTES = 50 * 1024 * 1024

type State =
  | { status: 'idle' }
  | { status: 'running'; progress: TranscribeProgress; startedAt: number }
  | { status: 'done'; midi: ArrayBuffer; seconds?: number; device?: string }
  | { status: 'error'; message: string }

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function progressLabel(p: TranscribeProgress) {
  switch (p.phase) {
    case 'uploading':
      return `Đang tải file âm thanh lên… ${Math.round(p.percent)}%`
    case 'processing':
      return 'Đang chuyển sang MIDI…'
  }
}

export function Transcriber() {
  const [file, setFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [state, setState] = useState<State>({ status: 'idle' })
  const [dragging, setDragging] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const running = state.status === 'running'
  const startedAt = running ? state.startedAt : null

  useEffect(() => {
    if (startedAt === null) return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500)
    return () => clearInterval(id)
  }, [startedAt])

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  function selectFile(f: File | undefined) {
    if (!f) return
    const isAudio = f.type.startsWith('audio/') || /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(f.name)
    if (!isAudio) {
      setState({ status: 'error', message: 'Vui lòng chọn file âm thanh (MP3, WAV, FLAC, OGG, M4A).' })
      return
    }
    if (f.size > MAX_BYTES) {
      setState({ status: 'error', message: 'File quá lớn. Giới hạn tối đa là 50 MB.' })
      return
    }
    setFile(f)
    setAudioUrl(URL.createObjectURL(f))
    setState({ status: 'idle' })
  }

  function reset() {
    abortRef.current?.abort()
    setFile(null)
    setAudioUrl(null)
    setState({ status: 'idle' })
    if (inputRef.current) inputRef.current.value = ''
  }

  async function start() {
    if (!file) return
    const controller = new AbortController()
    abortRef.current = controller
    setElapsed(0)
    setState({ status: 'running', progress: { phase: 'uploading', percent: 0 }, startedAt: Date.now() })
    try {
      const result = await transcribeToMidi(
        file,
        (progress) =>
          setState((s) => (s.status === 'running' ? { ...s, progress } : s)),
        controller.signal,
      )
      setState({ status: 'done', ...result })
    } catch (err) {
      if (controller.signal.aborted) {
        setState({ status: 'idle' })
        return
      }
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  function cancel() {
    abortRef.current?.abort()
  }

  const baseName = file?.name.replace(/\.[^.]+$/, '') ?? 'output'

  return (
    <div className="flex flex-col gap-4">
      <ServerStatus />
      <div className="rounded-xl border border-border p-4">
        {!file ? (
          <label
            htmlFor="audio-input"
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              selectFile(e.dataTransfer.files?.[0])
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input px-6 py-16 text-center transition-colors hover:border-foreground/40',
              dragging && 'border-foreground bg-muted',
            )}
          >
            <Upload className="mb-1 size-5 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium">Kéo thả hoặc bấm để chọn file</span>
            <span className="text-xs text-muted-foreground">MP3, WAV, FLAC, OGG, M4A · tối đa 50 MB</span>
            <input
              ref={inputRef}
              id="audio-input"
              type="file"
              accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a"
              className="sr-only"
              onChange={(e) => selectFile(e.target.files?.[0])}
            />
          </label>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <FileAudio className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={reset}
                aria-label="Bỏ file này"
                disabled={running}
              >
                <X />
              </Button>
            </div>

            {audioUrl && (
              <audio controls src={audioUrl} className="w-full" aria-label="Nghe thử file gốc" />
            )}

            {state.status === 'running' ? (
              <div className="flex flex-col gap-3" role="status" aria-live="polite">
                <div className="flex items-center gap-3">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1 text-sm">{progressLabel(state.progress)}</span>
                  <span className="font-mono text-xs text-muted-foreground">{elapsed}s</span>
                  <Button variant="ghost" size="sm" onClick={cancel}>
                    Huỷ
                  </Button>
                </div>
                <div className="h-px overflow-hidden bg-border">
                  <div className="h-full w-1/3 animate-[indeterminate_1.4s_ease-in-out_infinite] bg-foreground" />
                </div>
              </div>
            ) : state.status !== 'done' ? (
              <Button size="lg" className="h-11 w-full" onClick={start}>
                Chuyển sang MIDI
              </Button>
            ) : null}
          </div>
        )}

        {state.status === 'error' && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/30 p-3 text-sm"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="leading-relaxed">{state.message}</p>
          </div>
        )}
      </div>

      {state.status === 'done' && (
        <MidiResult midi={state.midi} fileName={`${baseName}.mid`} onReset={reset} />
      )}
    </div>
  )
}
