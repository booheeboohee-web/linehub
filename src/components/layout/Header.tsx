'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import { Avatar } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

const pageTitles: Record<string, string> = {
  '/dashboard': 'ダッシュボード',
  '/dashboard/friends': '友だち管理',
  '/dashboard/scenarios': 'シナリオ配信',
  '/dashboard/broadcast': '一斉配信',
  '/dashboard/richmenu': 'リッチメニュー',
  '/dashboard/settings': '設定',
  '/dashboard/analytics': '分析',
  '/dashboard/tags': 'タグ管理',
}

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string>('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? '')
    })
  }, [])

  const title =
    Object.entries(pageTitles)
      .filter(([key]) => pathname.startsWith(key))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? 'LineHub'

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const displayName = userEmail ? userEmail.split('@')[0] : '管理者'

  return (
    <header className="fixed left-64 right-0 top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>

      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-slate-500 sm:block">{userEmail}</span>
        <Avatar name={displayName} size="md" />
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          title="ログアウト"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">ログアウト</span>
        </button>
      </div>
    </header>
  )
}
