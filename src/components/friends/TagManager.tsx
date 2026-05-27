'use client'

import { useState } from 'react'
import { Plus, Trash2, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tag as TagType } from '@/types/database'

interface TagManagerProps {
  tags: TagType[]
  onTagsChange?: () => void
}

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#64748b',
]

export default function TagManager({ tags, onTagsChange }: TagManagerProps) {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [isAdding, setIsAdding] = useState(false)
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
      setNewName('')
      setNewColor('#6366f1')
      setIsAdding(false)
      onTagsChange?.()
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(tagId: string) {
    if (!confirm('このタグを削除しますか？')) return
    setLoading(true)
    try {
      await fetch(`/api/tags/${tagId}`, { method: 'DELETE' })
      onTagsChange?.()
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Tag className="h-4 w-4" />
          タグ管理
        </h3>
        <button
          onClick={() => { setIsAdding(true); setError(null) }}
          className="flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
        >
          <Plus className="h-3 w-3" />
          追加
        </button>
      </div>

      {isAdding && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
          <input
            type="text"
            placeholder="タグ名"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          <div className="flex flex-wrap gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={cn(
                  'h-6 w-6 rounded-full border-2 transition-transform',
                  newColor === c ? 'border-gray-900 scale-110' : 'border-transparent'
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={loading || !newName.trim()}
              className="flex-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? '作成中...' : '作成'}
            </button>
            <button
              onClick={() => { setIsAdding(false); setError(null); setNewName('') }}
              className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {tags.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">タグがありません</p>
        ) : (
          tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="text-sm text-gray-700">{tag.name}</span>
              </div>
              <button
                onClick={() => handleDelete(tag.id)}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
