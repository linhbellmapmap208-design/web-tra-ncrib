import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { transcribeFile } from '@/lib/transkun-worker'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus', '.webm'])

export async function POST(request: Request) {
  let file: FormDataEntryValue | null
  try {
    file = (await request.formData()).get('file')
  } catch {
    return Response.json({ detail: 'Yêu cầu không hợp lệ.' }, { status: 400 })
  }
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ detail: 'Không có file âm thanh.' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ detail: 'File quá lớn (tối đa 50 MB).' }, { status: 413 })
  }
  const ext = path.extname(file.name).toLowerCase()
  const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '.audio'

  const dir = await mkdtemp(path.join(tmpdir(), 'transkun-'))
  const input = path.join(dir, `input${safeExt}`)
  const output = path.join(dir, 'output.mid')
  try {
    await writeFile(input, Buffer.from(await file.arrayBuffer()))
    const { seconds, device } = await transcribeFile(input, output)
    const midi = await readFile(output)
    return new Response(midi, {
      headers: {
        'content-type': 'audio/midi',
        'x-transkun-seconds': seconds.toFixed(2),
        'x-transkun-device': device,
      },
    })
  } catch (err) {
    return Response.json(
      { detail: err instanceof Error ? err.message : 'Lỗi khi chạy Transkun.' },
      { status: 500 },
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
