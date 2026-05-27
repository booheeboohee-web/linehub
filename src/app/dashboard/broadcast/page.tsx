import { createAdminClient } from '@/lib/supabase/server'
import BroadcastList from '@/components/broadcast/BroadcastList'
import type { Broadcast, Tag } from '@/types/database'

export default async function BroadcastPage() {
  const supabase = await createAdminClient()

  const [{ data: broadcasts }, { data: tags }] = await Promise.all([
    supabase
      .from('broadcasts')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('tags')
      .select('*')
      .order('name', { ascending: true }),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">一斉配信</h1>
          <p className="mt-1 text-sm text-gray-500">
            友だち全員またはタグで絞り込んで一斉送信します
          </p>
        </div>
        <BroadcastList
          initialBroadcasts={(broadcasts as Broadcast[]) ?? []}
          tags={(tags as Tag[]) ?? []}
        />
      </div>
    </div>
  )
}
