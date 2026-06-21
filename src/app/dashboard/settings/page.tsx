'use client'

import { useState, useEffect } from 'react'
import { Eye, EyeOff, Copy, Check, RefreshCw, Save } from 'lucide-react'
import { cn } from '@/lib/utils'

function MaskedField({
  label,
  value,
  editable = false,
  onSave,
}: {
  label: string
  value: string
  editable?: boolean
  onSave?: (v: string) => void
}) {
  const [visible, setVisible] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const masked = value ? '•'.repeat(Math.min(value.length, 32)) : '（未設定）'

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {editing ? (
        <div className="flex gap-2">
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <button
            onClick={() => { onSave?.(draft); setEditing(false) }}
            className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
          >
            保存
          </button>
          <button
            onClick={() => { setDraft(value); setEditing(false) }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            取消
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-700">
            {visible ? (value || '（未設定）') : masked}
          </code>
          <button
            onClick={() => setVisible((v) => !v)}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 transition-colors"
            title={visible ? '非表示' : '表示'}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          {editable && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              編集
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-700">
          {value}
        </code>
        <button
          onClick={handleCopy}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
            copied
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-slate-200 text-slate-700 hover:bg-slate-50'
          )}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'コピー済み' : 'コピー'}
        </button>
      </div>
    </div>
  )
}

const TIMEZONES = [
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'UTC',
]

export default function SettingsPage() {
  // useEffect でクライアント側にのみ設定（ハイドレーションエラー防止）
  const [webhookUrl, setWebhookUrl] = useState('')
  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/webhook/line`)
  }, [])

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const [serviceName, setServiceName] = useState('LineHub')
  const [timezone, setTimezone] = useState('Asia/Tokyo')
  const [intervalMin, setIntervalMin] = useState(1)
  const [generalSaved, setGeneralSaved] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('linehub_settings')
    if (saved) {
      try {
        const s = JSON.parse(saved)
        if (s.serviceName) setServiceName(s.serviceName)
        if (s.timezone) setTimezone(s.timezone)
        if (s.intervalMin) setIntervalMin(s.intervalMin)
      } catch {
        // ignore
      }
    }
  }, [])

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/richmenu')
      if (res.ok) {
        setTestResult({ ok: true, message: '接続成功: Supabase と API が正常に動作しています' })
      } else {
        setTestResult({ ok: false, message: `接続エラー: HTTP ${res.status}` })
      }
    } catch (err) {
      setTestResult({ ok: false, message: `接続エラー: ${err}` })
    } finally {
      setTesting(false)
    }
  }

  function handleSaveGeneral() {
    localStorage.setItem('linehub_settings', JSON.stringify({ serviceName, timezone, intervalMin }))
    setGeneralSaved(true)
    setTimeout(() => setGeneralSaved(false), 2000)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">設定</h1>
        <p className="mt-1 text-sm text-slate-500">アカウントとサービスの設定を管理します</p>
      </div>

      {/* Section 1: LINE API */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-slate-900">LINE API 設定</h2>
        <div className="space-y-4">
          <MaskedField
            label="チャンネルアクセストークン"
            value={process.env.NEXT_PUBLIC_LINE_ACCESS_TOKEN_HINT ?? ''}
            editable
            onSave={(v) => console.log('Token updated (client-side only):', v)}
          />
          <MaskedField
            label="チャンネルシークレット"
            value={process.env.NEXT_PUBLIC_LINE_SECRET_HINT ?? ''}
          />
          <CopyableField label="Webhook URL" value={webhookUrl} />

          <div className="pt-2">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
            >
              <RefreshCw className={cn('h-4 w-4', testing && 'animate-spin')} />
              {testing ? '確認中…' : '接続テスト'}
            </button>
            {testResult && (
              <p
                className={cn(
                  'mt-2 text-sm',
                  testResult.ok ? 'text-green-600' : 'text-red-600'
                )}
              >
                {testResult.message}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Section 2: General */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-slate-900">一般設定</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">サービス名</label>
            <input
              type="text"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">タイムゾーン</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div className="pt-1">
            <button
              onClick={handleSaveGeneral}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                generalSaved
                  ? 'bg-green-100 text-green-700'
                  : 'bg-green-600 text-white hover:bg-green-700'
              )}
            >
              <Save className="h-4 w-4" />
              {generalSaved ? '保存しました' : '保存'}
            </button>
          </div>
        </div>
      </section>

      {/* Section 3: Scheduler */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-slate-900">シナリオ配信スケジューラー</h2>
        <p className="mb-5 text-xs text-slate-500">
          Vercel Cron が毎分 <code className="font-mono">/api/scenarios/deliver</code> を実行します
        </p>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              配信チェック間隔（分）
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={60}
                value={intervalMin}
                onChange={(e) => setIntervalMin(Number(e.target.value))}
                className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <span className="text-sm text-slate-500">分ごとにチェック</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              現在の設定: vercel.json の cron スケジュール <code className="font-mono">* * * * *</code>（毎分）
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">最終実行時刻</label>
            <p className="text-sm text-slate-500">
              {new Date().toLocaleString('ja-JP', { timeZone: timezone })}（ページ読み込み時点）
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
