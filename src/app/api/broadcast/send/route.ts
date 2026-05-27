import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { multicastMessage } from '@/lib/line'

export async function POST(req: NextRequest) {
  const { broadcastId } = await req.json()
  if (!broadcastId) return NextResponse.json({ error: 'broadcastId required' }, { status: 400 })

  const supabase = await createAdminClient()

  // 配信データ取得
  const { data: broadcast, error } = await supabase
    .from('broadcasts')
    .select('*')
    .eq('id', broadcastId)
    .single()

  if (error || !broadcast) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
  if (broadcast.status !== 'draft' && broadcast.status !== 'scheduled') {
    return NextResponse.json({ error: 'Already sent' }, { status: 400 })
  }

  // ステータスを送信中に更新
  await supabase.from('broadcasts').update({ status: 'sending' }).eq('id', broadcastId)

  // 対象友だちを取得
  let query = supabase
    .from('friends')
    .select('id, platform, platform_user_id')
    .eq('status', 'active')

  if (broadcast.platform !== 'all') {
    query = query.eq('platform', broadcast.platform)
  }
  if (broadcast.target_type === 'tag' && broadcast.target_tag_ids?.length) {
    const { data: taggedFriends } = await supabase
      .from('friend_tags')
      .select('friend_id')
      .in('tag_id', broadcast.target_tag_ids)
    const ids = taggedFriends?.map((f) => f.friend_id) ?? []
    query = query.in('id', ids)
  }

  const { data: friends } = await query

  if (!friends?.length) {
    await supabase.from('broadcasts').update({
      status: 'done',
      total_targets: 0,
      sent_count: 0,
      sent_at: new Date().toISOString(),
    }).eq('id', broadcastId)
    return NextResponse.json({ ok: true, sent: 0 })
  }

  // LINE multicast (最大500件ずつ)
  const lineUsers = friends.filter((f) => f.platform === 'line').map((f) => f.platform_user_id)
  let sentCount = 0
  let errorCount = 0

  const BATCH = 500
  for (let i = 0; i < lineUsers.length; i += BATCH) {
    const batch = lineUsers.slice(i, i + BATCH)
    try {
      await multicastMessage(batch, [broadcast.message_content])
      sentCount += batch.length
    } catch (err) {
      console.error('Multicast error:', err)
      errorCount += batch.length
    }
  }

  // ログ一括挿入
  await supabase.from('message_logs').insert(
    friends.map((f) => ({
      friend_id: f.id,
      platform: f.platform,
      direction: 'outbound' as const,
      message_type: broadcast.message_type,
      message_content: broadcast.message_content,
      source_type: 'broadcast' as const,
      source_id: broadcastId,
      status: 'sent',
      sent_at: new Date().toISOString(),
    }))
  )

  // 配信完了に更新
  await supabase.from('broadcasts').update({
    status: errorCount > 0 && sentCount === 0 ? 'error' : 'done',
    total_targets: friends.length,
    sent_count: sentCount,
    error_count: errorCount,
    sent_at: new Date().toISOString(),
  }).eq('id', broadcastId)

  return NextResponse.json({ ok: true, sent: sentCount, errors: errorCount })
}
