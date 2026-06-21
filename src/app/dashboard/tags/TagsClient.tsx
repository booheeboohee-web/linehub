'use client'

import { useState } from 'react'
import { Plus, Trash2, Tag, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tag as TagType } from '@/types/database'

interface TagWithCount extends TagType {
  friendCount: number
}

interface TagsClientProps {
  initialTags: TagWithCount[]
}

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#64748b',
]

export default function TagsClient({ initialTags }: TagsClientProps) {
  const [tags, setTags] = useState<TagWithCount[]>(initialTags)
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!newName.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'エラーが発生しました')
        return
      }
      setTags(prev => [{ ...json, friendCount: 0 }, ...prev])
      setNewName('')
      setNewColor('#6366f1')
      setIsAdding(false)
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(tagId: string, force = false) {
    if (!force && !confirm('このタグを削除しますか？\n友だちへの紐づけも解除されます。')) return
    setLoading(true)
    try {
      const url = force ? `/api/tags/${tagId}?force=true` : `/api/tags/${tagId}`
      const res = await fetch(url, { method: 'DELETE' })
      const json = await res.json()

      if (res.status === 409 && json.scenarios) {
        const names = (json.scenarios as { name: string }[]).map(s => `・${s.name}`).join('\n')
        const confirmed = confirm(
          `このタグは以下のシナリオのトリガーとして使われています：\n\n${names}\n\nシナリオのトリガーが解除されますが、削除を続けますか？`
        )
        if (confirmed) await handleDelete(tagId, true)
        return
      }

      if (res.ok) {
        setTags(prev => prev.filter(t => t.id !== tagId))
      } else {
        setError(json.error ?? '削除に失敗しました')
      }
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {tags.length} 件のタグ
        </p>
        <button
          onClick={() => { setIsAdding(true); setError(null) }}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} />
          新規タグ作成
        </button>
      </div>

      {/* Create form */}
      {isAdding && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-800">新規タグを作成</h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="タグ名を入力"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">カラーを選択</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-all',
                      newColor === c
                        ? 'border-slate-900 scale-110 shadow-md'
                        : 'border-transparent hover:scale-105'
                    )}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
            {/* Preview */}
            {newName.trim() && (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 w-fit">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: newColor }} />
                <span className="text-sm text-slate-700">{newName.trim()}</span>
              </div>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={loading || !newName.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? '作成中...' : '作成する'}
            </button>
            <button
              onClick={() => {
                setIsAdding(false)
                setError(null)
                setNewName('')
                setNewColor('#6366f1')
              }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Tags grid */}
      {tags.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-16 text-slate-400">
          <Tag size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">タグがまだありません</p>
          <p className="mt-1 text-xs">「新規タグ作成」ボタンから追加できます</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="h-4 w-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{tag.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Users size={11} className="text-slate-400" />
                    <span className="text-xs text-slate-400">{tag.friendCount} 人</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(tag.id)}
                disabled={loading}
                className="ml-3 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0"
                title="タグを削除"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
