import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, opts?: { time?: boolean }) {
  const d = typeof date === 'string' ? new Date(date) : date
  const dateStr = d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
  if (opts?.time) {
    const timeStr = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    return `${dateStr} ${timeStr}`
  }
  return dateStr
}

export function platformLabel(platform: string) {
  const map: Record<string, string> = {
    line: 'LINE',
    email: 'メール',
    all: '全プラットフォーム',
  }
  return map[platform] ?? platform
}

export function platformColor(platform: string) {
  const map: Record<string, string> = {
    line: 'bg-green-100 text-green-800',
    email: 'bg-blue-100 text-blue-800',
    all: 'bg-purple-100 text-purple-800',
  }
  return map[platform] ?? 'bg-gray-100 text-gray-800'
}
