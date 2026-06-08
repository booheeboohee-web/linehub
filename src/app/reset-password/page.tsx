'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [ready, setReady] = useState(false)

  const exchangeToken = useCallback(async () => {
    const supabase = createClient()

    // 方法1: URLクエリパラメータから token_hash を取得（新しい形式）
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type')

    if (tokenHash && type === 'recovery') {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      })
      if (!error) {
        setReady(true)
        return
      }
    }

    // 方法2: URLハッシュフラグメントから取得（古い形式 #access_token=...）
    if (typeof window !== 'undefined') {
      const hash = window.location.hash
      if (hash.includes('access_token')) {
        // Supabase が自動でセッションを設定するのを待つ
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          setReady(true)
          return
        }
      }
    }

    // 方法3: すでにセッションがある（ログイン済み）
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      setReady(true)
      return
    }

    // 方法4: onAuthStateChange で PASSWORD_RECOVERY を待つ
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true)
        subscription.unsubscribe()
      }
    })

    // 5秒待ってもセッションが取れなければエラー表示
    setTimeout(async () => {
      const { data: { session: s } } = await supabase.auth.getSession()
      if (!s) {
        setError('リンクの有効期限が切れているか、無効なリンクです。もう一度パスワードリセットをお試しください。')
        setReady(true) // エラー表示のために ready にする
      }
    }, 5000)
  }, [searchParams])

  useEffect(() => {
    exchangeToken()
  }, [exchangeToken])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください')
      return
    }
    if (password !== confirm) {
      setError('パスワードが一致しません')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })

      if (updateError) {
        setError('パスワードの変更に失敗しました。リンクの有効期限が切れている可能性があります。')
        return
      }

      setDone(true)
      setTimeout(() => router.push('/dashboard'), 2000)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-green-600">LineHub</h1>
          <p className="mt-1 text-sm text-slate-500">マーケティング自動化ツール</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">

          {/* 完了画面 */}
          {done ? (
            <>
              <div className="mb-4 flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                  <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
              </div>
              <h2 className="mb-2 text-center text-lg font-semibold text-slate-900">パスワードを変更しました</h2>
              <p className="text-center text-sm text-slate-500">ダッシュボードに移動します…</p>
            </>
          ) : !ready ? (
            /* 認証待ち */
            <div className="py-4 text-center text-sm text-slate-500">
              <div className="mb-3 flex justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
              </div>
              認証情報を確認しています…
            </div>
          ) : error && !password ? (
            /* トークンエラー */
            <>
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              <button
                onClick={() => router.push('/login')}
                className="w-full rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                ログインページに戻る
              </button>
            </>
          ) : (
            /* パスワード入力フォーム */
            <>
              <h2 className="mb-2 text-center text-lg font-semibold text-slate-900">新しいパスワードを設定</h2>
              <p className="mb-6 text-center text-sm text-slate-500">8文字以上のパスワードを入力してください</p>

              {error && (
                <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-slate-700">
                    新しいパスワード
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-slate-700">
                    パスワードの確認
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
                >
                  {loading ? '変更中…' : 'パスワードを変更する'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
