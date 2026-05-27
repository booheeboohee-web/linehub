'use client'

import { useState } from 'react'
import { Send, Plus, Copy, Clock, CheckCircle2, AlertCircle, Loader2, FileText, Trash2, Eye, X } from 'lucide-react'
import { cn, platformLabel, platformColor, formatDate } from '@/lib/utils'
import type { Broadcast, BroadcastStatus, Tag } from '@/types/database'
import BroadcastComposer from './BroadcastComposer'

interface Props {
  initialBroadcasts: Broadcast[]
  tags: Tag[]
}

const statusConfig: Record<
  BroadcastStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  draft: {
    label: '下書き',
    className: 'bg-gray-100 text-gray-700',
    icon: <FileText className="w-3.5 h-3.5" />,
  },
  scheduled: {
    label: '予約済み',
    className: 'bg-blue-100 text-blue-700',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  sending: {
    label: '送信中',
    className: 'bg-yellow-100 text-yellow-700',
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  },
  done: {
    label: '完了',
    className: 'bg-green-100 text-green-700',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  error: {
    label: 'エラー',
    className: 'bg-red-100 text-red-700',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
}

// ---- 詳細モーダル ----
function BroadcastDetailModal({ broadcast, onClose }: { broadcast: Broadcast; onClose: () => void }) {
  const content = broadcast.message_content as any
  const isFlex = broadcast.message_type === 'flex'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{broadcast.name}</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* メタ情報 */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">プラットフォーム</p>
              <p className="font-medium">{platformLabel(broadcast.platform)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">メッセージ種類</p>
              <p className="font-medium">{isFlex ? 'カード（Flex）' : 'テキスト'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">対象</p>
              <p className="font-medium">
                {broadcast.target_type === 'all' ? '全員' : `タグ指定 (${broadcast.target_tag_ids?.length ?? 0})`}
              </p>
            </div>
            {broadcast.scheduled_at && (
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-blue-500 mb-1">予約日時</p>
                <p className="font-medium text-blue-700">{formatDate(broadcast.scheduled_at, { time: true })}</p>
              </div>
            )}
          </div>

          {/* メッセージ内容プレビュー */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">メッセージ内容</p>
            {isFlex ? (
              <div className="bg-[#87ceeb] rounded-xl p-4">
                <div className="bg-white rounded-xl p-3 text-sm text-gray-700 max-h-48 overflow-y-auto">
                  <p className="font-medium text-gray-900 mb-1">代替テキスト: {content?.altText}</p>
                  <pre className="text-xs text-gray-500 whitespace-pre-wrap break-all">
                    {JSON.stringify(content?.contents, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="bg-[#87ceeb] rounded-xl p-4">
                <div className="flex gap-2 items-start">
                  <div className="w-6 h-6 rounded-full bg-white flex-shrink-0" />
                  <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2 shadow-sm max-w-xs">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{content?.text}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BroadcastList({ initialBroadcasts, tags }: Props) {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>(initialBroadcasts)
  const [composerOpen, setComposerOpen] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [detailBroadcast, setDetailBroadcast] = useState<Broadcast | null>(null)

  async function handleSend(broadcast: Broadcast) {
    if (!confirm(`「${broadcast.name}」を今すぐ送信しますか？`)) return
    setSendingId(broadcast.id)
    try {
      const res = await fetch('/api/broadcast/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcastId: broadcast.id }),
      })
      if (res.ok) {
        const result = await res.json()
        setBroadcasts((prev) =>
          prev.map((b) =>
            b.id === broadcast.id
              ? {
                  ...b,
                  status: 'done',
                  sent_count: result.sent,
                  error_count: result.errors ?? 0,
                  sent_at: new Date().toISOString(),
                }
              : b
          )
        )
      }
    } finally {
      setSendingId(null)
    }
  }

  async function handleDelete(broadcast: Broadcast) {
    if (!confirm(`「${broadcast.name}」を削除しますか？この操作は元に戻せません。`)) return
    const res = await fetch(`/api/broadcasts/${broadcast.id}`, { method: 'DELETE' })
    if (res.ok) {
      setBroadcasts((prev) => prev.filter((b) => b.id !== broadcast.id))
    } else {
      alert('削除に失敗しました。送信済みの配信は削除できません。')
    }
  }

  async function handleDuplicate(broadcast: Broadcast) {
    const res = await fetch('/api/broadcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${broadcast.name} (コピー)`,
        platform: broadcast.platform,
        message_type: broadcast.message_type,
        message_content: broadcast.message_content,
        target_type: broadcast.target_type,
        target_tag_ids: broadcast.target_tag_ids,
      }),
    })
    if (res.ok) {
      const { data } = await res.json()
      setBroadcasts((prev) => [data, ...prev])
    }
  }

  function handleSaved(broadcast: Broadcast) {
    setBroadcasts((prev) => {
      const idx = prev.findIndex((b) => b.id === broadcast.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = broadcast
        return next
      }
      return [broadcast, ...prev]
    })
    setComposerOpen(false)
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setComposerOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新規配信作成
        </button>
      </div>

      {broadcasts.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Send className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">配信がありません</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {broadcasts.map((broadcast) => {
            const status = statusConfig[broadcast.status]
            return (
              <div
                key={broadcast.id}
                className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h3 className="font-semibold text-gray-900 text-base truncate">
                        {broadcast.name}
                      </h3>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
                          status.className
                        )}
                      >
                        {status.icon}
                        {status.label}
                      </span>
                      <span
                        className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full',
                          platformColor(broadcast.platform)
                        )}
                      >
                        {platformLabel(broadcast.platform)}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>対象: {broadcast.total_targets.toLocaleString()} 人</span>
                      {broadcast.sent_count > 0 && (
                        <span className="text-green-600">
                          送信済み: {broadcast.sent_count.toLocaleString()} 人
                        </span>
                      )}
                      {broadcast.error_count > 0 && (
                        <span className="text-red-500">
                          エラー: {broadcast.error_count.toLocaleString()} 件
                        </span>
                      )}
                    </div>

                    {broadcast.scheduled_at && broadcast.status === 'scheduled' && (
                      <p className="text-xs text-blue-600 mt-1.5 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        予約日時: {formatDate(broadcast.scheduled_at, { time: true })}
                      </p>
                    )}
                    {broadcast.sent_at && (
                      <p className="text-xs text-gray-400 mt-1.5">
                        送信日時: {formatDate(broadcast.sent_at, { time: true })}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* 詳細ボタン */}
                    <button
                      onClick={() => setDetailBroadcast(broadcast)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      詳細
                    </button>
                    {/* 送信ボタン（draft のみ） */}
                    {broadcast.status === 'draft' && (
                      <button
                        onClick={() => handleSend(broadcast)}
                        disabled={sendingId === broadcast.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                      >
                        {sendingId === broadcast.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        送信
                      </button>
                    )}
                    {/* 複製ボタン */}
                    <button
                      onClick={() => handleDuplicate(broadcast)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      複製
                    </button>
                    {/* 削除ボタン（draft / scheduled のみ） */}
                    {(broadcast.status === 'draft' || broadcast.status === 'scheduled') && (
                      <button
                        onClick={() => handleDelete(broadcast)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        削除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {composerOpen && (
        <BroadcastComposer
          tags={tags}
          onClose={() => setComposerOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {detailBroadcast && (
        <BroadcastDetailModal
          broadcast={detailBroadcast}
          onClose={() => setDetailBroadcast(null)}
        />
      )}
    </>
  )
}
