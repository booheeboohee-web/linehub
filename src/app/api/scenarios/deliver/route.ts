/**
 * シナリオ配信 Cron エンドポイント
 * Vercel Cron / Supabase pg_cron から定期実行（毎分）
 * GET /api/scenarios/deliver
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { pushMessage } from '@/lib/line'

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

  // 送信タイミングになったシナリオ購読を取得
  const { data: subscribers } = await supabase
    .from('scenario_subscribers')
    .select('*, friend:friends(*), scenario:scenarios(*, steps:scenario_steps(*))')
    .eq('status', 'active')
    .lte('next_send_at', now)
    .limit(100)

  let deliveredCount = 0

  for (const sub of (subscribers ?? []) as any[]) {
    try {
      const steps: ScenarioStep[] = (sub.scenario?.steps ?? []).sort(
        (a: ScenarioStep, b: ScenarioStep) => a.step_order - b.step_order
      )
      const step = steps[sub.current_step]
      if (!step) {
        // 全ステップ完了
        await supabase
          .from('scenario_subscribers')
          .update({ status: 'completed' })
          .eq('id', sub.id)
        continue
      }

      const friend = sub.friend
      if (!friend || friend.status !== 'active') continue

      // プラットフォーム別送信
      if (friend.platform === 'line') {
        await pushMessage(friend.platform_user_id, [step.message_content])
      }
      // TODO: Email

      // ログ記録
      await supabase.from('message_logs').insert({
        friend_id: friend.id,
        platform: friend.platform,
        direction: 'outbound',
        message_type: step.message_type,
        message_content: step.message_content,
        source_type: 'scenario',
        source_id: sub.scenario_id,
        status: 'sent',
        sent_at: now,
      })

      // 次のステップの送信時刻を計算
      const nextStep = steps[sub.current_step + 1]
      if (nextStep) {
        const nextSendAt = new Date()
        nextSendAt.setDate(nextSendAt.getDate() + nextStep.delay_days)
        nextSendAt.setHours(nextSendAt.getHours() + nextStep.delay_hours)

        await supabase
          .from('scenario_subscribers')
          .update({
            current_step: sub.current_step + 1,
            next_send_at: nextSendAt.toISOString(),
          })
          .eq('id', sub.id)
      } else {
        // 最終ステップ送信完了
        await supabase
          .from('scenario_subscribers')
          .update({ status: 'completed' })
          .eq('id', sub.id)
      }

      deliveredCount++
    } catch (err) {
      console.error(`Delivery error for subscriber ${sub.id}:`, err)
    }
  }

  return NextResponse.json({ ok: true, delivered: deliveredCount })
}

interface ScenarioStep {
  id: string
  step_order: number
  delay_days: number
  delay_hours: number
  message_type: string
  message_content: object
}
