import 'server-only'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline'

export type WorkerStatus =
  | { status: 'loading' }
  | { status: 'ok'; model: string; device: string }
  | { status: 'offline'; error: string }

type Pending = { resolve: (seconds: number) => void; reject: (err: Error) => void }

type Worker = {
  proc: ChildProcessWithoutNullStreams
  status: WorkerStatus
  pending: Map<string, Pending>
}

const WORKER_SCRIPT = path.join(process.cwd(), 'transkun-server', 'worker.py')

function pythonExecutable() {
  if (process.env.TRANSKUN_PYTHON) return process.env.TRANSKUN_PYTHON
  const candidates = [
    path.join(process.cwd(), 'transkun-server', '.venv', 'bin', 'python'),
    '/tmp/tkvenv/bin/python',
  ]
  return candidates.find((p) => existsSync(p)) ?? 'python3'
}

// Kept on globalThis so the loaded model survives hot reloads in development.
const globalForWorker = globalThis as unknown as { transkunWorker?: Worker }

function startWorker(): Worker {
  const proc = spawn(pythonExecutable(), [WORKER_SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] })
  const worker: Worker = { proc, status: { status: 'loading' }, pending: new Map() }
  let stderrTail = ''

  proc.stderr.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000)
  })

  createInterface({ input: proc.stdout }).on('line', (line) => {
    let msg: { type: string; id?: string; error?: string; seconds?: number; model?: string; device?: string }
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (msg.type === 'ready') {
      worker.status = { status: 'ok', model: msg.model!, device: msg.device! }
    } else if (msg.type === 'fatal') {
      worker.status = { status: 'offline', error: msg.error ?? 'Lỗi không xác định' }
    } else if (msg.type === 'result' && msg.id) {
      const job = worker.pending.get(msg.id)
      worker.pending.delete(msg.id)
      if (msg.error) job?.reject(new Error(msg.error))
      else job?.resolve(msg.seconds ?? 0)
    }
  })

  const fail = (reason: string) => {
    if (worker.status.status !== 'offline') worker.status = { status: 'offline', error: reason }
    for (const job of worker.pending.values()) job.reject(new Error(reason))
    worker.pending.clear()
    if (globalForWorker.transkunWorker === worker) globalForWorker.transkunWorker = undefined
  }
  proc.on('error', (err) => fail(`Không chạy được Python: ${err.message}. Hãy chạy pnpm setup:transkun.`))
  proc.on('exit', (code) =>
    fail(`Tiến trình Transkun đã dừng (mã ${code}). ${stderrTail.trim().split('\n').pop() ?? ''}`.trim()),
  )

  return worker
}

export function getWorker(): Worker {
  globalForWorker.transkunWorker ??= startWorker()
  return globalForWorker.transkunWorker
}

async function waitUntilReady(worker: Worker, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  while (worker.status.status === 'loading') {
    if (Date.now() > deadline) throw new Error('Hết thời gian chờ nạp mô hình Transkun.')
    await new Promise((r) => setTimeout(r, 250))
  }
  if (worker.status.status === 'offline') throw new Error(worker.status.error)
  return worker.status
}

/** Runs Transkun V2 on an audio file and writes a MIDI file. Jobs are processed in order. */
export async function transcribeFile(input: string, output: string) {
  const worker = getWorker()
  const { device } = await waitUntilReady(worker)
  const id = crypto.randomUUID()
  const seconds = await new Promise<number>((resolve, reject) => {
    worker.pending.set(id, { resolve, reject })
    worker.proc.stdin.write(JSON.stringify({ id, input, output }) + '\n')
  })
  return { seconds, device }
}
