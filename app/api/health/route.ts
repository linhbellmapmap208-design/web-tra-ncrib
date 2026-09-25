import { getWorker } from '@/lib/transkun-worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  const { status } = getWorker()
  return Response.json(status, { status: status.status === 'offline' ? 503 : 200 })
}
