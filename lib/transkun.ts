export type TranscribeProgress =
  | { phase: 'uploading'; percent: number }
  | { phase: 'processing' }

export type TranscribeResult = {
  midi: ArrayBuffer
  seconds?: number
  device?: string
}

function parseError(xhr: XMLHttpRequest) {
  try {
    const text = new TextDecoder().decode(xhr.response as ArrayBuffer)
    const detail = JSON.parse(text)?.detail
    if (typeof detail === 'string') return detail
  } catch {}
  return `Máy chủ Transkun trả về lỗi ${xhr.status}.`
}

export function transcribeToMidi(
  file: File,
  onProgress: (p: TranscribeProgress) => void,
  signal: AbortSignal,
): Promise<TranscribeResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/transcribe')
    xhr.responseType = 'arraybuffer'

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress({ phase: 'uploading', percent: (e.loaded / e.total) * 100 })
    }
    xhr.upload.onload = () => onProgress({ phase: 'processing' })

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const seconds = Number(xhr.getResponseHeader('x-transkun-seconds'))
        resolve({
          midi: xhr.response as ArrayBuffer,
          seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : undefined,
          device: xhr.getResponseHeader('x-transkun-device') ?? undefined,
        })
      } else {
        reject(new Error(parseError(xhr)))
      }
    }
    xhr.onerror = () => reject(new Error('Không kết nối được tới máy chủ Transkun.'))
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', () => xhr.abort(), { once: true })

    const form = new FormData()
    form.append('file', file)
    onProgress({ phase: 'uploading', percent: 0 })
    xhr.send(form)
  })
}
