'use client'

import { useState } from 'react'
import { X, Send, Save, Clock, MessageSquare, LayoutTemplate, Type } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Broadcast, Tag } from '@/types/database'
import FlexMessageBuilder from '@/components/flex/FlexMessageBuilder'

interface Props {
  tags: Tag[]
  onClose: () => void
  onSaved: (broadcast: Broadcast) => void
}

type TargetType = 'all' | 'tag'
type SendMode = 'now' | 'scheduled'
type MsgType = 'text' | 'flex'

export default function BroadcastComposer({ tags, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [platform, setPlatform] = useState<'line' | 'all'>('line')
  const [targetType, setTargetType] = useState<TargetType>('all')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [msgType, setMsgType] = useState<MsgType>('text')
  const [messageText, setMessageText] = useState('')
  const [flexMessage, setFlexMessage] = useState<object | null>(null)
  const [sendMode, setSendMode] = useState<SendMode>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  function buildPayload(schedAt?: string | null) {
    const isText = msgType === 'text'
    return {
      name: name.trim(),
      platform,
      message_type: isText ? ('text' as const) : ('flex' as const),
      message_content: isText
        ? { type: 'text' as const, text: messageText }
        : (flexMessage ?? { type: 'flex', altText: '', contents: {} }),
      target_type: targetType,
      target_tag_ids: targetType === 'tag' ? selectedTagIds : null,
      scheduled_at: schedAt ?? (sendMode === 'scheduled' ? scheduledAt || null : null),
    }
  }

  function validate() {
    if (!name.trim()) return 'タイトルを入力してください'
    if (msgType === 'text' && !messageText.trim()) return 'メッセージを入力してください'
    if (msgType === 'flex' && !flexMessage) return 'カードの内容を設定してください'
    if (targetType === 'tag' && selectedTagIds.length === 0)
      return 'タグを1つ以上選択してください'
    if (sendMode === 'scheduled' && !scheduledAt)
      return '予約日時を指定してください'
    return null
  }

  async function saveBroadcast() {
    const err = validate()
    if (err) { setError(err); return null }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? '保存に失敗しました')
      return (await res.json()).data as Broadcast
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    const broadcast = await saveBroadcast()
    if (broadcast) onSaved(broadcast)
  }

  async function handleSend() {
    const err = validate()
    if (err) { setError(err); return }
    setSending(true)
    setError(null)
    try {
      // Create the broadcast first
      const createRes = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(null)),
      })
      if (!createRes.ok) throw new Error((await createRes.json()).error ?? '作成に失敗しました')
      const broadcast: Broadcast = (await createRes.json()).data

      // Send it immediately
      const sendRes = await fetch('/api/broadcast/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcastId: broadcast.id }),
      })
      if (!sendRes.ok) throw new Error('送信に失敗しました')

      const result = await sendRes.json()
      onSaved({
        ...broadcast,
        status: 'done',
        sent_count: result.sent,
        error_count: result.errors ?? 0,
        sent_at: new Date().toISOString(),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '送信に失敗しました')
    } finally {
      setSending(false)
    }
  }

  const charCount = messageText.length

  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 m-auto w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">新規配信作成</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: form */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                配信名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 5月キャンペーン告知"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Platform */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                プラットフォーム
              </label>
              <div className="flex gap-3">
                {([
                  { value: 'line', label: 'LINE' },
                  { value: 'all', label: '全て' },
                ] as { value: 'line' | 'all'; label: string }[]).map((p) => (
                  <label key={p.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="platform"
                      value={p.value}
                      checked={platform === p.value}
                      onChange={() => setPlatform(p.value)}
                      className="text-indigo-600"
                    />
                    <span className="text-sm text-gray-700">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Target */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">対象絞り込み</label>
              <div className="flex gap-4 mb-3">
                {([
                  { value: 'all', label: '全員' },
                  { value: 'tag', label: 'タグ指定' },
                ] as { value: TargetType; label: string }[]).map((t) => (
                  <label key={t.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="target_type"
                      value={t.value}
                      checked={targetType === t.value}
                      onChange={() => setTargetType(t.value)}
                      className="text-indigo-600"
                    />
                    <span className="text-sm text-gray-700">{t.label}</span>
                  </label>
                ))}
              </div>

              {targetType === 'tag' && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">タグを選択（複数可）</p>
                  {tags.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">タグがありません</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className={cn(
                            'px-3 py-1 text-sm rounded-full border transition-colors',
                            selectedTagIds.includes(tag.id)
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                              : 'border-gray-300 text-gray-600 hover:border-indigo-300'
                          )}
                          style={{
                            borderColor: selectedTagIds.includes(tag.id)
                              ? undefined
                              : tag.color,
                          }}
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Message Type Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                メッセージタイプ
              </label>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setMsgType('text')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
                    msgType === 'text'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                  )}
                >
                  <Type className="w-4 h-4" />
                  テキスト
                </button>
                <button
                  onClick={() => setMsgType('flex')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
                    msgType === 'flex'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                  )}
                >
                  <LayoutTemplate className="w-4 h-4" />
                  カード（Flex）
                </button>
              </div>

              {msgType === 'text' ? (
                <>
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="送信するメッセージを入力..."
                    rows={5}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <p className="text-xs text-gray-400 text-right mt-1">{charCount} 文字</p>
                </>
              ) : (
                <div className="border border-gray-200 rounded-xl p-4">
                  <FlexMessageBuilder onChange={setFlexMessage} />
                </div>
              )}
            </div>

            {/* Send mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">送信タイミング</label>
              <div className="flex gap-4 mb-3">
                {([
                  { value: 'now', label: '今すぐ送信' },
                  { value: 'scheduled', label: '予約送信' },
                ] as { value: SendMode; label: string }[]).map((m) => (
                  <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="send_mode"
                      value={m.value}
                      checked={sendMode === m.value}
                      onChange={() => setSendMode(m.value)}
                      className="text-indigo-600"
                    />
                    <span className="text-sm text-gray-700">{m.label}</span>
                  </label>
                ))}
              </div>

              {sendMode === 'scheduled' && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>
          </div>

          {/* Right: preview */}
          <div className="w-72 flex-shrink-0 border-l border-gray-200 bg-gray-50 p-5 overflow-y-auto">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wider">
              プレビュー
            </h3>

            {/* LINE-style phone mock */}
            <div className="bg-[#87ceeb] rounded-xl p-3 min-h-48">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-gray-500" />
                </div>
                <span className="text-xs text-white font-medium drop-shadow">
                  公式アカウント
                </span>
              </div>

              {messageText ? (
                <div className="flex gap-2 items-start">
                  <div className="w-6 h-6 rounded-full bg-white flex-shrink-0 mt-0.5" />
                  <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2 shadow-sm max-w-[180px]">
                    <p className="text-xs text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                      {messageText}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center mt-8">
                  <p className="text-xs text-white/70">メッセージを入力すると</p>
                  <p className="text-xs text-white/70">ここにプレビューが表示されます</p>
                </div>
              )}
            </div>

            {/* Meta info */}
            <div className="mt-4 space-y-2 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>プラットフォーム</span>
                <span className="font-medium text-gray-700">
                  {platform === 'line' ? 'LINE' : '全て'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>対象</span>
                <span className="font-medium text-gray-700">
                  {targetType === 'all'
                    ? '全員'
                    : selectedTagIds.length > 0
                    ? `${selectedTagIds.length} タグ`
                    : 'タグ未選択'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>送信</span>
                <span className="font-medium text-gray-700">
                  {sendMode === 'now'
                    ? '今すぐ'
                    : scheduledAt
                    ? new Date(scheduledAt).toLocaleString('ja-JP', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '未設定'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving || sending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '保存'}
            </button>
            {sendMode === 'now' && (
              <button
                onClick={handleSend}
                disabled={saving || sending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
              >
                <Send className="w-4 h-4" />
                {sending ? '送信中...' : '今すぐ送信'}
              </button>
            )}
            {sendMode === 'scheduled' && (
              <button
                onClick={handleSave}
                disabled={saving || sending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                <Clock className="w-4 h-4" />
                {saving ? '予約中...' : '予約送信'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
