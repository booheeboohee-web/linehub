'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Plus, Trash2, MessageSquare, Calendar, Clock, Send } from 'lucide-react'
import { cn, formatDate, platformLabel, platformColor } from '@/lib/utils'
import type { Friend, Tag, MessageLog } from '@/types/database'

interface FriendDetailProps {
  friendId: string | null
  allTags: Tag[]
  onClose: () => void
  onUpdate?: () => void
}

export default function FriendDetail({ friendId, allTags, onClose, onUpdate }: FriendDetailProps) {
  const [friend, setFriend] = useState<Friend | null>(null)
  const [logs, setLogs] = useState<MessageLog[]>([])
  const [note, setNote] = useState('')
  const [noteEditing, setNoteEditing] = useState(false)
  const [noteSaving, setNoteSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tagLoading, setTagLoading] = useState(false)
  const [showTagSelect, setShowTagSelect] = useState(false)
  const [sendText, setSendText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const fetchDetail = useCallback(async () => {
    if (!friendId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/friends/${friendId}`)
      if (!res.ok) return
      const json = await res.json()
      setFriend(json.data)
      setNote(json.data.note ?? '')
      setLogs(json.logs ?? [])
    } finally {
      setLoading(false)
    }
  }, [friendId])

  useEffect(() => {
    fetchDetail()
    setNoteEditing(false)
    setShowTagSelect(false)
  }, [fetchDetail])

  async function handleSaveNote() {
    if (!friend) return
    setNoteSaving(true)
    try {
      await fetch(`/api/friends/${friend.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      setNoteEditing(false)
      onUpdate?.()
    } finally {
      setNoteSaving(false)
    }
  }

  async function handleAddTag(tagId: string) {
    if (!friend) return
    setTagLoading(true)
    try {
      await fetch(`/api/friends/${friend.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: tagId }),
      })
      await fetchDetail()
      setShowTagSelect(false)
    } finally {
      setTagLoading(false)
    }
  }

  async function handleRemoveTag(tagId: string) {
    if (!friend) return
    setTagLoading(true)
    try {
      await fetch(`/api/friends/${friend.id}/tags`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: tagId }),
      })
      await fetchDetail()
    } finally {
      setTagLoading(false)
    }
  }

  async function handleSendMessage() {
    if (!friend || !sendText.trim()) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch(`/api/friends/${friend.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: sendText.trim() }),
      })
      if (res.ok) {
        setSendText('')
        setSendResult({ ok: true, msg: '送信しました！' })
        await fetchDetail()
      } else {
        const data = await res.json()
        setSendResult({ ok: false, msg: data.error ?? '送信に失敗しました' })
      }
    } catch {
      setSendResult({ ok: false, msg: '通信エラーが発生しました' })
    } finally {
      setSending(false)
      setTimeout(() => setSendResult(null), 3000)
    }
  }

  const friendTagIds = new Set(friend?.tags?.map((t) => t.id) ?? [])
  const availableTags = allTags.filter((t) => !friendTagIds.has(t.id))

  const isOpen = !!friendId

  return (
    <>
      {/* オーバーレイ */}
      <div
        className={cn(
          'fixed inset-0 bg-black/40 z-40 transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* スライドオーバーパネル */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-300',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">友だち詳細</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading && (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            </div>
          )}

          {!loading && friend && (
            <>
              {/* アバター・名前 */}
              <div className="flex items-center gap-4">
                {friend.picture_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={friend.picture_url}
                    alt={friend.display_name ?? ''}
                    className="h-16 w-16 rounded-full object-cover border border-gray-200"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-xl font-semibold text-indigo-600">
                    {(friend.display_name ?? '?')[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {friend.display_name ?? '名前なし'}
                  </h3>
                  <span className={cn('inline-block mt-1 rounded-full px-2.5 py-0.5 text-xs font-medium', platformColor(friend.platform))}>
                    {platformLabel(friend.platform)}
                  </span>
                </div>
              </div>

              {/* 基本情報 */}
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-500">登録日:</span>
                  <span>{formatDate(friend.followed_at)}</span>
                </div>
                {friend.last_interacted_at && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-500">最終インタラクション:</span>
                    <span>{formatDate(friend.last_interacted_at, { time: true })}</span>
                  </div>
                )}
                {friend.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="text-gray-500">メール:</span>
                    <span>{friend.email}</span>
                  </div>
                )}
                {friend.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="text-gray-500">電話:</span>
                    <span>{friend.phone}</span>
                  </div>
                )}
              </div>

              {/* タグ */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700">タグ</h4>
                  <button
                    onClick={() => setShowTagSelect(!showTagSelect)}
                    disabled={tagLoading}
                    className="flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                    追加
                  </button>
                </div>

                {showTagSelect && availableTags.length > 0 && (
                  <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-2 space-y-1 max-h-40 overflow-y-auto">
                    {availableTags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => handleAddTag(tag.id)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50 transition-colors"
                      >
                        <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                        {tag.name}
                      </button>
                    ))}
                  </div>
                )}
                {showTagSelect && availableTags.length === 0 && (
                  <p className="text-xs text-gray-400">追加できるタグがありません</p>
                )}

                <div className="flex flex-wrap gap-2">
                  {(friend.tags ?? []).length === 0 ? (
                    <p className="text-xs text-gray-400">タグなし</p>
                  ) : (
                    (friend.tags ?? []).map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
                      >
                        {tag.name}
                        <button
                          onClick={() => handleRemoveTag(tag.id)}
                          className="ml-0.5 rounded-full hover:opacity-70 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* メモ */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700">メモ</h4>
                  {!noteEditing && (
                    <button
                      onClick={() => setNoteEditing(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      編集
                    </button>
                  )}
                </div>
                {noteEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      placeholder="メモを入力..."
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveNote}
                        disabled={noteSaving}
                        className="flex-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {noteSaving ? '保存中...' : '保存'}
                      </button>
                      <button
                        onClick={() => { setNoteEditing(false); setNote(friend.note ?? '') }}
                        className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600 min-h-[3rem]">
                    {note || <span className="text-gray-400">メモなし</span>}
                  </p>
                )}
              </div>

              {/* 個別メッセージ送信 */}
              {friend.status === 'active' && friend.platform === 'line' && (
                <div className="space-y-2">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <Send className="h-4 w-4" />
                    メッセージを送る
                  </h4>
                  <div className="flex gap-2">
                    <textarea
                      value={sendText}
                      onChange={(e) => setSendText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSendMessage()
                      }}
                      rows={2}
                      placeholder="メッセージを入力… (⌘+Enter で送信)"
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={sending || !sendText.trim()}
                      className="self-end rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      {sending ? '…' : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                  {sendResult && (
                    <p className={cn('text-xs', sendResult.ok ? 'text-green-600' : 'text-red-600')}>
                      {sendResult.msg}
                    </p>
                  )}
                </div>
              )}

              {/* メッセージ履歴 */}
              <div className="space-y-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <MessageSquare className="h-4 w-4" />
                  メッセージ履歴（直近5件）
                </h4>
                {logs.length === 0 ? (
                  <p className="text-xs text-gray-400">履歴なし</p>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className={cn(
                          'rounded-lg px-3 py-2 text-xs',
                          log.direction === 'inbound'
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-indigo-50 text-indigo-800'
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">
                            {log.direction === 'inbound' ? '受信' : '送信'}
                          </span>
                          <span className="text-gray-500">{formatDate(log.sent_at, { time: true })}</span>
                        </div>
                        {log.message_content && (
                          <p className="truncate">
                            {'text' in log.message_content ? log.message_content.text : `[${log.message_type}]`}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
