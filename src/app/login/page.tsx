'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'login' | 'forgot' | 'forgot-sent'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        setError('メールアドレスまたはパスワードが正しくありません')
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
        }
      )

      if (resetError) {
        setError('メールの送信に失敗しました。もう一度お試しください。')
        return
      }

      setMode('forgot-sent')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-green-600">LineHub</h1>
          <p className="mt-1 text-sm text-slate-500">マーケティング自動化ツール</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">

          {/* ── ログイン ── */}
          {mode === 'login' && (
            <>
              <h2 className="mb-6 text-center text-lg font-semibold text-slate-900">ログイン</h2>

              {error && (
                <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                    メールアドレス
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                    パスワード
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
                >
                  {loading ? 'ログイン中…' : 'ログイン'}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => { setError(null); setMode('forgot') }}
                  className="text-sm text-slate-500 hover:text-green-600 underline underline-offset-2 transition-colors"
                >
                  パスワードをお忘れの方はこちら
                </button>
              </div>
            </>
          )}

          {/* ── パスワードリセット（入力） ── */}
          {mode === 'forgot' && (
            <>
              <h2 className="mb-2 text-center text-lg font-semibold text-slate-900">
                パスワードをリセット
              </h2>
              <p className="mb-6 text-center text-sm text-slate-500">
                登録済みのメールアドレスを入力してください。
                <br />
                再設定用のリンクをお送りします。
              </p>

              {error && (
                <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="mb-1.5 block text-sm font-medium text-slate-700">
                    メールアドレス
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
                >
                  {loading ? '送信中…' : 'リセットメールを送る'}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => { setError(null); setMode('login') }}
                  className="text-sm text-slate-500 hover:text-green-600 underline underline-offset-2 transition-colors"
                >
                  ← ログインに戻る
                </button>
              </div>
            </>
          )}

          {/* ── パスワードリセット（送信完了） ── */}
          {mode === 'forgot-sent' && (
            <>
              <div className="mb-4 flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                  <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                </div>
              </div>
              <h2 className="mb-2 text-center text-lg font-semibold text-slate-900">メールを送信しました</h2>
              <p className="mb-6 text-center text-sm text-slate-500">
                <span className="font-medium text-slate-700">{email}</span> に
                <br />
                パスワード再設定のリンクを送りました。
                <br />
                メールをご確認ください。
              </p>

              <button
                type="button"
                onClick={() => { setError(null); setMode('login') }}
                className="w-full rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                ログインに戻る
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
