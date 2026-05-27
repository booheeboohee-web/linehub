'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, ChevronLeft, ChevronRight, UserPlus } from 'lucide-react'
import { cn, formatDate, platformLabel, platformColor } from '@/lib/utils'
import type { Friend, Tag } from '@/types/database'
import FriendDetail from './FriendDetail'

type PlatformFilter = 'all' | 'line' | 'email'

const LIMIT = 20

export default function FriendList() {
  const [friends, setFriends] = useState<Friend[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const [platform, setPlatform] = useState<PlatformFilter>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null)

  // タグ一覧を取得
  const fetchTags = useCallback(async () => {
    const res = await fetch('/api/tags')
    if (!res.ok) return
    const json = await res.json()
    setTags(json.data ?? [])
  }, [])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  // 友だち一覧を取得
  const fetchFriends = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (platform !== 'all') params.set('platform', platform)
      if (search) params.set('search', search)
      if (selectedTags.length > 0) params.set('tag_id', selectedTags[0]) // 現在は1タグ絞り込み
      params.set('page', String(page))
      params.set('limit', String(LIMIT))

      const res = await fetch(`/api/friends?${params.toString()}`)
      if (!res.ok) return
      const json = await res.json()
      setFriends(json.data ?? [])
      setTotal(json.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [platform, search, selectedTags, page])

  useEffect(() => {
    fetchFriends()
  }, [fetchFriends])

  // フィルター変更時はページを1に戻す
  function handlePlatformChange(p: PlatformFilter) {
    setPlatform(p)
    setPage(1)
  }

  function handleTagToggle(tagId: string) {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
    setPage(1)
  }

  function handleSearch() {
    setSearch(searchInput)
    setPage(1)
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="flex flex-col gap-6">
      {/* フィルター群 */}
      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        {/* 検索 */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="名前で検索..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={handleSearch}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            検索
          </button>
        </div>

        {/* プラットフォームフィルター */}
        <div className="flex flex-wrap gap-2">
          {(['all', 'line', 'email'] as const).map((p) => (
            <button
              key={p}
              onClick={() => handlePlatformChange(p)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                platform === p
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
              )}
            >
              {p === 'all' ? '全て' : platformLabel(p)}
            </button>
          ))}
        </div>

        {/* タグフィルター */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const active = selectedTags.includes(tag.id)
              return (
                <button
                  key={tag.id}
                  onClick={() => handleTagToggle(tag.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
                    active ? 'border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                  style={active ? { backgroundColor: `${tag.color}22`, color: tag.color, borderColor: tag.color } : {}}
                >
                  <span
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 件数表示 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {loading ? '読み込み中...' : `${total} 件`}
        </p>
      </div>

      {/* 友だちリスト */}
      {!loading && friends.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-16 gap-3">
          <UserPlus className="h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">友だちが見つかりませんでした</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {friends.map((friend) => (
            <FriendCard
              key={friend.id}
              friend={friend}
              onClick={() => setSelectedFriendId(friend.id)}
            />
          ))}
        </div>
      )}

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-gray-600">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-md border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 友だち詳細スライドオーバー */}
      <FriendDetail
        friendId={selectedFriendId}
        allTags={tags}
        onClose={() => setSelectedFriendId(null)}
        onUpdate={fetchFriends}
      />
    </div>
  )
}

interface FriendCardProps {
  friend: Friend
  onClick: () => void
}

function FriendCard({ friend, onClick }: FriendCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all">
      {/* アバター + 名前 + プラットフォーム */}
      <div className="flex items-start gap-3">
        {friend.picture_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={friend.picture_url}
            alt={friend.display_name ?? ''}
            className="h-10 w-10 rounded-full object-cover border border-gray-100 flex-shrink-0"
          />
        ) : (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600">
            {(friend.display_name ?? '?')[0].toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            {friend.display_name ?? '名前なし'}
          </p>
          <span className={cn('inline-block mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium', platformColor(friend.platform))}>
            {platformLabel(friend.platform)}
          </span>
        </div>
      </div>

      {/* タグ */}
      {(friend.tags ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(friend.tags ?? []).slice(0, 3).map((tag) => (
            <span
              key={tag.id}
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
            >
              {tag.name}
            </span>
          ))}
          {(friend.tags ?? []).length > 3 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              +{(friend.tags ?? []).length - 3}
            </span>
          )}
        </div>
      )}

      {/* 登録日 + 詳細ボタン */}
      <div className="flex items-center justify-between mt-auto pt-1 border-t border-gray-100">
        <p className="text-xs text-gray-400">{formatDate(friend.followed_at)}</p>
        <button
          onClick={onClick}
          className="rounded-md bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
        >
          詳細
        </button>
      </div>
    </div>
  )
}
