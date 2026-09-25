import { Transcriber } from '@/components/transcriber'

export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 py-12 md:py-20">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">MP3 → MIDI</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Tải lên bản thu piano, nhận về file MIDI.
        </p>
      </header>

      <Transcriber />
    </main>
  )
}
