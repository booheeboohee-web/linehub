/**
 * 予約配信処理エンドポイント
 * cron-job.org から定期実行（毎分）
 * GET /api/broadcasts/scheduled?secret=<CRON_SECRET>
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { multicastMessage } from '@/lib/line'

export async function GET(req: Request) {
  // 簡易認証: Authorization: Bearer <CRON_SECRET> または ?secret=<CRON_SECRET>
  if (process.env.CRON_SECRET) {
    const url = new URL(req.url)
    const querySecret = url.searchParams.get('secret')
    const auth = new Headers(req.headers).get('authorization')
    const headerOk = auth === `Bearer ${process.env.CRON_SECRET}`
    const queryOk = querySecret === process.env.CRON_SECRET
    if (!headerOk && !queryOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = await createAdminClient()
  const now = new Date().toISOString()

  // 送信時刻を過ぎた予約配信を取得
  const { data: broadcasts } = await supabase
    .from('broadcasts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(20)

  let processedCount = 0

  for (const broadcast of (broadcasts ?? []) as any[]) {
    try {
      // 送信中に更新（二重送信防止）
      const { error: lockError } = await supabase
        .from('broadcasts')
        .update({ status: 'sending' })
        .eq('id', broadcast.id)
        .eq('status', 'scheduled') // 楽観的ロック
      if (lockError) continue

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
        const ids = taggedFriends?.map((f: any) => f.friend_id) ?? []
        if (ids.length === 0) {
          await supabase.from('broadcasts').update({
            status: 'done',
            total_targets: 0,
            sent_count: 0,
            sent_at: now,
          }).eq('id', broadcast.id)
          continue
        }
        query = query.in('id', ids)
      }

      const { data: friends } = await query

      if (!friends?.length) {
        await supabase.from('broadcasts').update({
          status: 'done',
          total_targets: 0,
          sent_count: 0,
          sent_at: now,
        }).eq('id', broadcast.id)
        continue
      }

      // LINE multicast（500件ずつ）
      const lineUsers = friends
        .filter((f: any) => f.platform === 'line')
        .map((f: any) => f.platform_user_id)

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

      // ログ挿入
      if (friends.length > 0) {
        await supabase.from('message_logs').insert(
          friends.map((f: any) => ({
            friend_id: f.id,
            platform: f.platform,
            direction: 'outbound' as const,
            message_type: broadcast.message_type,
            message_content: broadcast.message_content,
            source_type: 'broadcast' as const,
            source_id: broadcast.id,
            status: 'sent',
            sent_at: now,
          }))
        )
      }

      // 完了更新
      await supabase.from('broadcasts').update({
        status: errorCount > 0 && sentCount === 0 ? 'error' : 'done',
        total_targets: friends.length,
        sent_count: sentCount,
        error_count: errorCount,
        sent_at: now,
      }).eq('id', broadcast.id)

      processedCount++
    } catch (err) {
      console.error(`Scheduled broadcast error ${broadcast.id}:`, err)
      await supabase.from('broadcasts').update({ status: 'error' }).eq('id', broadcast.id)
    }
  }

  return NextResponse.json({ ok: true, processed: processedCount })
}
