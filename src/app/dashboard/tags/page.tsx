import { Card } from '@/components/ui/Card'
import { createAdminClient } from '@/lib/supabase/server'
import TagsClient from './TagsClient'

export const revalidate = 0

export default async function TagsPage() {
  const supabase = await createAdminClient()

  const [{ data: tags }, { data: friendTagCounts }] = await Promise.all([
    supabase.from('tags').select('*').order('created_at', { ascending: false }),
    supabase.from('friend_tags').select('tag_id'),
  ])

  // Count friends per tag
  const counts: Record<string, number> = {}
  ;(friendTagCounts ?? []).forEach(ft => {
    counts[ft.tag_id] = (counts[ft.tag_id] ?? 0) + 1
  })

  const tagsWithCounts = (tags ?? []).map(tag => ({
    ...tag,
    friendCount: counts[tag.id] ?? 0,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">タグ管理</h2>
        <p className="mt-1 text-sm text-slate-500">
          友だちの分類に使用するタグを作成・管理できます
        </p>
      </div>

      <Card className="p-6">
        <TagsClient initialTags={tagsWithCounts} />
      </Card>
    </div>
  )
}
