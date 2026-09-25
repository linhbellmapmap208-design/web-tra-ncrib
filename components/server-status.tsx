'use client'

import useSWR from 'swr'
import { cn } from '@/lib/utils'

type Health =
  | { status: 'loading' }
  | { status: 'ok'; model: string; device: string }
  | { status: 'offline'; error: string }

const fetcher = async (url: string): Promise<Health> => {
  const res = await fetch(url, { cache: 'no-store' })
  return res.json()
}

export function ServerStatus() {
  const { data } = useSWR('/api/health', fetcher, {
    refreshInterval: (latest) => (latest?.status === 'ok' ? 30000 : 2000),
  })
  const online = data?.status === 'ok'
  const isLoading = !data || data.status === 'loading'

  const label =
    data?.status === 'ok'
      ? `Sẵn sàng · ${data.device.toUpperCase()}`
      : data?.status === 'offline'
        ? `Mô hình chưa chạy được — ${data.error}`
        : 'Đang nạp mô hình…'

  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full',
          isLoading ? 'animate-pulse bg-muted-foreground' : online ? 'bg-foreground' : 'bg-destructive',
        )}
      />
      <span className="font-mono text-xs">{label}</span>
    </p>
  )
}
