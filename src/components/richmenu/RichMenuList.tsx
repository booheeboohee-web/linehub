'use client'

import { useState, useRef } from 'react'
import { LayoutGrid, Plus, Pencil, Trash2, Zap, CheckCircle, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RichMenu } from '@/types/database'
import { RichMenuEditor } from './RichMenuEditor'

interface Props {
  initialMenus: RichMenu[]
}

export function RichMenuList({ initialMenus }: Props) {
  const [menus, setMenus] = useState<RichMenu[]>(initialMenus)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingMenu, setEditingMenu] = useState<RichMenu | null>(null)
  const [activating, setActivating] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const fileInputRef = useRef<{ [menuId: string]: HTMLInputElement | null }>({})

  async function handleActivate(menu: RichMenu) {
    setActivating(menu.id)
    try {
      const res = await fetch(`/api/richmenu/${menu.id}/activate`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const updated: RichMenu = await res.json()
      setMenus((prev) =>
        prev.map((m) =>
          m.id === updated.id
            ? updated
            : { ...m, is_active: false, is_default: false }
        )
      )
    } catch (err) {
      alert(`適用に失敗しました: ${err}`)
    } finally {
      setActivating(null)
    }
  }

  async function handleDelete(menu: RichMenu) {
    if (!confirm(`「${menu.name}」を削除しますか？`)) return
    setDeleting(menu.id)
    try {
      const res = await fetch(`/api/richmenu/${menu.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      setMenus((prev) => prev.filter((m) => m.id !== menu.id))
    } catch (err) {
      alert(`削除に失敗しました: ${err}`)
    } finally {
      setDeleting(null)
    }
  }

  function handleEdit(menu: RichMenu) {
    setEditingMenu(menu)
    setEditorOpen(true)
  }

  function handleNew() {
    setEditingMenu(null)
    setEditorOpen(true)
  }

  async function handleImageUpload(menu: RichMenu, file: File) {
    setUploading(menu.id)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/richmenu/${menu.id}/image`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? '画像のアップロードに失敗しました')
        return
      }
      // Update local state to show image was uploaded
      setMenus(prev => prev.map(m =>
        m.id === menu.id
          ? { ...m, image_url: `line://richmenu-image/${m.line_rich_menu_id}` }
          : m
      ))
      alert('画像をアップロードしました！LINEアプリで確認してください。')
    } catch (err) {
      alert(`エラー: ${err}`)
    } finally {
      setUploading(null)
    }
  }

  function handleSaved(menu: RichMenu) {
    setMenus((prev) => {
      const idx = prev.findIndex((m) => m.id === menu.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = menu
        return next
      }
      return [menu, ...prev]
    })
    setEditorOpen(false)
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          onClick={handleNew}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          新規リッチメニュー作成
        </button>
      </div>

      {menus.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
          <LayoutGrid className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">リッチメニューがまだありません</p>
          <button
            onClick={handleNew}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            最初のメニューを作成
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {menus.map((menu) => (
            <div
              key={menu.id}
              className={cn(
                'rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md',
                menu.is_active ? 'border-green-300 ring-1 ring-green-200' : 'border-slate-200'
              )}
            >
              {/* Header */}
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-slate-900">{menu.name}</h3>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    チャットバー: {menu.chat_bar_text}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {menu.is_active && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      <CheckCircle className="h-3 w-3" />
                      アクティブ
                    </span>
                  )}
                  {menu.is_default && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      デフォルト
                    </span>
                  )}
                  {!menu.is_active && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                      非アクティブ
                    </span>
                  )}
                </div>
              </div>

              {/* Preview image */}
              {menu.image_url?.startsWith('line://') ? (
                <div className="mb-3 flex h-20 items-center justify-center rounded-lg border border-green-200 bg-green-50">
                  <span className="text-sm font-medium text-green-700">✓ 画像アップロード済み</span>
                </div>
              ) : menu.image_url ? (
                <div className="mb-3 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={menu.image_url}
                    alt={menu.name}
                    className="h-24 w-full object-cover"
                  />
                </div>
              ) : (
                <div className="mb-3 flex h-20 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 gap-1">
                  <LayoutGrid className="h-6 w-6 text-slate-300" />
                  {menu.is_active && (
                    <p className="text-xs text-slate-400 px-2 text-center">画像をアップロードしてLINEに表示させましょう</p>
                  )}
                </div>
              )}

              {/* Size info */}
              <p className="mb-3 text-xs text-slate-400">
                {menu.size_width} × {menu.size_height} / エリア {menu.areas?.length ?? 0}個
              </p>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {!menu.is_active && (
                  <button
                    onClick={() => handleActivate(menu)}
                    disabled={activating === menu.id}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
                  >
                    <Zap className="h-3 w-3" />
                    {activating === menu.id ? '適用中…' : 'LINE に適用'}
                  </button>
                )}
                <button
                  onClick={() => handleEdit(menu)}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  編集
                </button>
                <button
                  onClick={() => handleDelete(menu)}
                  disabled={deleting === menu.id}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  削除
                </button>
                {/* Image upload - only for active menus with LINE ID */}
                {menu.is_active && menu.line_rich_menu_id && (
                  <>
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      className="hidden"
                      ref={(el) => { fileInputRef.current[menu.id] = el }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleImageUpload(menu, file)
                        e.target.value = '' // reset
                      }}
                    />
                    <button
                      onClick={() => fileInputRef.current[menu.id]?.click()}
                      disabled={uploading === menu.id}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-60 transition-colors"
                    >
                      <Upload className="h-3 w-3" />
                      {uploading === menu.id ? 'アップロード中…' : '画像アップロード'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editorOpen && (
        <RichMenuEditor
          menu={editingMenu}
          onClose={() => setEditorOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
