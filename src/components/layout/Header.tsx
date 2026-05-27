'use client'

import { usePathname } from 'next/navigation'
import { Avatar } from '@/components/ui'

const pageTitles: Record<string, string> = {
  '/dashboard': 'ダッシュボード',
  '/dashboard/friends': '友だち管理',
  '/dashboard/scenarios': 'シナリオ配信',
  '/dashboard/broadcast': '一斉配信',
  '/dashboard/richmenu': 'リッチメニュー',
  '/dashboard/settings': '設定',
}

export function Header() {
  const pathname = usePathname()

  // Find the most specific matching title
  const title =
    Object.entries(pageTitles)
      .filter(([key]) => pathname.startsWith(key))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? 'LineHub'

  return (
    <header className="fixed left-64 right-0 top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>

      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-slate-500 sm:block">
          管理者
        </span>
        <Avatar name="管理者" size="md" />
      </div>
    </header>
  )
}
