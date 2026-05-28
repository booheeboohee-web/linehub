'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RichMenu, RichMenuArea } from '@/types/database'

// 6-area preset grid (2500x1686 large size)
const PRESET_AREAS_LARGE: RichMenuArea['bounds'][] = [
  { x: 0,    y: 0,   width: 833, height: 843 },
  { x: 833,  y: 0,   width: 834, height: 843 },
  { x: 1667, y: 0,   width: 833, height: 843 },
  { x: 0,    y: 843, width: 833, height: 843 },
  { x: 833,  y: 843, width: 834, height: 843 },
  { x: 1667, y: 843, width: 833, height: 843 },
]

const AREA_COLORS = [
  'bg-blue-200 border-blue-400 text-blue-900',
  'bg-green-200 border-green-400 text-green-900',
  'bg-yellow-200 border-yellow-400 text-yellow-900',
  'bg-purple-200 border-purple-400 text-purple-900',
  'bg-pink-200 border-pink-400 text-pink-900',
  'bg-orange-200 border-orange-400 text-orange-900',
]

const ACTION_TYPES: { value: RichMenuArea['action']['type']; label: string }[] = [
  { value: 'message', label: 'テキスト送信' },
  { value: 'uri', label: 'URL' },
  { value: 'postback', label: 'ポストバック' },
  { value: 'richmenuswitch', label: 'タブ切り替え' },
]

interface AreaConfig {
  actionType: RichMenuArea['action']['type']
  text: string
  uri: string
  data: string
  label: string
  richMenuAliasId: string
}

const defaultAreaConfig = (): AreaConfig => ({
  actionType: 'message',
  text: '',
  uri: '',
  data: '',
  label: '',
  richMenuAliasId: '',
})

interface Props {
  menu: RichMenu | null
  onClose: () => void
  onSaved: (menu: RichMenu) => void
}

export function RichMenuEditor({ menu, onClose, onSaved }: Props) {
  const isLarge = !menu || menu.size_height === 1686
  const [name, setName] = useState(menu?.name ?? '')
  const [chatBarText, setChatBarText] = useState(menu?.chat_bar_text ?? 'メニュー')
  const [large, setLarge] = useState(isLarge)
  const [areaConfigs, setAreaConfigs] = useState<AreaConfig[]>(() => {
    if (menu?.areas?.length) {
      return menu.areas.map((a) => ({
        actionType: a.action.type,
        text: a.action.text ?? '',
        uri: a.action.uri ?? '',
        data: a.action.data ?? '',
        label: a.action.label ?? '',
        richMenuAliasId: a.action.richMenuAliasId ?? '',
      }))
    }
    return Array.from({ length: 6 }, defaultAreaConfig)
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sizeWidth = 2500
  const sizeHeight = large ? 1686 : 843
  const previewScale = 0.14

  const previewAreas = large ? PRESET_AREAS_LARGE : [
    { x: 0,    y: 0,   width: 833, height: 421 },
    { x: 833,  y: 0,   width: 834, height: 421 },
    { x: 1667, y: 0,   width: 833, height: 421 },
    { x: 0,    y: 421, width: 833, height: 422 },
    { x: 833,  y: 421, width: 834, height: 422 },
    { x: 1667, y: 421, width: 833, height: 422 },
  ]

  function updateArea(idx: number, field: keyof AreaConfig, value: string) {
    setAreaConfigs((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  function buildAreas(): RichMenuArea[] {
    const bounds = large ? PRESET_AREAS_LARGE : [
      { x: 0,    y: 0,   width: 833, height: 421 },
      { x: 833,  y: 0,   width: 834, height: 421 },
      { x: 1667, y: 0,   width: 833, height: 421 },
      { x: 0,    y: 421, width: 833, height: 422 },
      { x: 833,  y: 421, width: 834, height: 422 },
      { x: 1667, y: 421, width: 833, height: 422 },
    ]
    return areaConfigs.map((cfg, i) => {
      const action: RichMenuArea['action'] = { type: cfg.actionType }
      if (cfg.actionType === 'message') action.text = cfg.text
      if (cfg.actionType === 'uri') {
        action.uri = cfg.uri
        action.label = cfg.label
      }
      if (cfg.actionType === 'postback') {
        action.data = cfg.data
        action.text = cfg.text
        action.label = cfg.label
      }
      if (cfg.actionType === 'richmenuswitch') {
        action.richMenuAliasId = cfg.richMenuAliasId
        action.data = cfg.data || 'switch'
      }
      return { bounds: bounds[i], action }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('メニュー名を入力してください'); return }
    if (!chatBarText.trim()) { setError('チャットバーテキストを入力してください'); return }

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        chat_bar_text: chatBarText.trim(),
        size_width: sizeWidth,
        size_height: sizeHeight,
        areas: buildAreas(),
      }

      const url = menu ? `/api/richmenu/${menu.id}` : '/api/richmenu'
      const method = menu ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      const saved: RichMenu = await res.json()
      onSaved(saved)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-5xl max-h-[90vh] flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {menu ? 'リッチメニューを編集' : 'リッチメニューを新規作成'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Form */}
          <form onSubmit={handleSubmit} className="flex w-96 shrink-0 flex-col overflow-y-auto border-r border-slate-200">
            <div className="space-y-4 p-6">
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}

              {menu?.id && (
                <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">
                  <span className="font-medium">このメニューのエイリアスID:</span>{' '}
                  <span className="font-mono">{`richmenu-alias-${menu.id.slice(0, 8)}`}</span>
                  <br />
                  <span>（他のメニューのタブ切り替えで使用）</span>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  メニュー名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: メインメニュー"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  チャットバーテキスト <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={chatBarText}
                  onChange={(e) => setChatBarText(e.target.value)}
                  placeholder="例: メニュー"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">サイズ</label>
                <div className="flex gap-3">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="size"
                      checked={large}
                      onChange={() => setLarge(true)}
                      className="accent-green-600"
                    />
                    <span className="text-sm text-slate-700">大 (2500×1686)</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="size"
                      checked={!large}
                      onChange={() => setLarge(false)}
                      className="accent-green-600"
                    />
                    <span className="text-sm text-slate-700">小 (2500×843)</span>
                  </label>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">タップ領域設定（最大6つ）</p>
                <div className="space-y-3">
                  {areaConfigs.map((cfg, i) => (
                    <div key={i} className={cn('rounded-lg border p-3', AREA_COLORS[i])}>
                      <p className="mb-2 text-xs font-semibold">エリア {i + 1}</p>
                      <div className="space-y-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium">アクションタイプ</label>
                          <select
                            value={cfg.actionType}
                            onChange={(e) => updateArea(i, 'actionType', e.target.value as RichMenuArea['action']['type'])}
                            className="w-full rounded border border-white/60 bg-white/80 px-2 py-1 text-xs focus:outline-none"
                          >
                            {ACTION_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                        {cfg.actionType === 'message' && (
                          <div>
                            <label className="mb-1 block text-xs font-medium">送信テキスト</label>
                            <input
                              type="text"
                              value={cfg.text}
                              onChange={(e) => updateArea(i, 'text', e.target.value)}
                              placeholder="送信するテキスト"
                              className="w-full rounded border border-white/60 bg-white/80 px-2 py-1 text-xs focus:outline-none"
                            />
                          </div>
                        )}
                        {cfg.actionType === 'uri' && (
                          <>
                            <div>
                              <label className="mb-1 block text-xs font-medium">URL</label>
                              <input
                                type="url"
                                value={cfg.uri}
                                onChange={(e) => updateArea(i, 'uri', e.target.value)}
                                placeholder="https://example.com"
                                className="w-full rounded border border-white/60 bg-white/80 px-2 py-1 text-xs focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium">ラベル</label>
                              <input
                                type="text"
                                value={cfg.label}
                                onChange={(e) => updateArea(i, 'label', e.target.value)}
                                placeholder="ラベル"
                                className="w-full rounded border border-white/60 bg-white/80 px-2 py-1 text-xs focus:outline-none"
                              />
                            </div>
                          </>
                        )}
                        {cfg.actionType === 'postback' && (
                          <>
                            <div>
                              <label className="mb-1 block text-xs font-medium">データ</label>
                              <input
                                type="text"
                                value={cfg.data}
                                onChange={(e) => updateArea(i, 'data', e.target.value)}
                                placeholder="action=xxx"
                                className="w-full rounded border border-white/60 bg-white/80 px-2 py-1 text-xs focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium">表示テキスト</label>
                              <input
                                type="text"
                                value={cfg.text}
                                onChange={(e) => updateArea(i, 'text', e.target.value)}
                                placeholder="ボタンテキスト"
                                className="w-full rounded border border-white/60 bg-white/80 px-2 py-1 text-xs focus:outline-none"
                              />
                            </div>
                          </>
                        )}
                        {cfg.actionType === 'richmenuswitch' && (
                          <div>
                            <label className="mb-1 block text-xs font-medium">切り替え先エイリアスID</label>
                            <input
                              type="text"
                              value={cfg.richMenuAliasId}
                              onChange={(e) => updateArea(i, 'richMenuAliasId', e.target.value)}
                              placeholder="richmenu-alias-xxxxxxxx"
                              className="w-full rounded border border-white/60 bg-white/80 px-2 py-1 text-xs focus:outline-none"
                            />
                            <p className="mt-1 text-xs text-slate-500">例: richmenu-alias-xxxxxxxx</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 border-t border-slate-200 bg-white px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
              >
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </form>

          {/* Right: Preview */}
          <div className="flex flex-1 flex-col items-center justify-center bg-slate-100 p-6">
            <p className="mb-3 text-xs font-medium text-slate-500 uppercase tracking-wide">プレビュー</p>
            <div
              className="relative overflow-hidden rounded-lg border-2 border-slate-300 bg-white shadow-inner"
              style={{
                width: sizeWidth * previewScale,
                height: sizeHeight * previewScale,
              }}
            >
              {previewAreas.map((bounds, i) => {
                const cfg = areaConfigs[i]
                const label = cfg.actionType === 'message'
                  ? cfg.text || `エリア ${i + 1}`
                  : cfg.actionType === 'uri'
                  ? cfg.label || cfg.uri || `エリア ${i + 1}`
                  : cfg.label || cfg.data || `エリア ${i + 1}`

                return (
                  <div
                    key={i}
                    className={cn(
                      'absolute flex items-center justify-center border text-center text-xs font-medium',
                      AREA_COLORS[i]
                    )}
                    style={{
                      left: bounds.x * previewScale,
                      top: bounds.y * previewScale,
                      width: bounds.width * previewScale,
                      height: bounds.height * previewScale,
                    }}
                  >
                    <span className="line-clamp-2 px-1" style={{ fontSize: 8 }}>
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {sizeWidth} × {sizeHeight}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
