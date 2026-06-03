import { NextRequest, NextResponse } from 'next/server'
import { verifyLineSignature, getProfile, replyMessage } from '@/lib/line'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('x-line-signature') ?? ''

  // 署名検証
  if (!verifyLineSignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(body)
  const supabase = await createAdminClient()

  for (const event of payload.events ?? []) {
    try {
      await handleEvent(event, supabase)
    } catch (err) {
      console.error('Event handling error:', err)
    }
  }

  return NextResponse.json({ ok: true })
}

async function handleEvent(event: LineEvent, supabase: Awaited<ReturnType<typeof createAdminClient>>) {
  const userId = event.source?.userId
  if (!userId) return

  // 友だち登録イベント
  if (event.type === 'follow') {
    const profile = await getProfile(userId)
    const { data: friend } = await supabase
      .from('friends')
      .upsert({
        platform: 'line',
        platform_user_id: userId,
        display_name: profile?.displayName ?? null,
        picture_url: profile?.pictureUrl ?? null,
        status: 'active',
        followed_at: new Date().toISOString(),
      }, { onConflict: 'platform,platform_user_id' })
      .select()
      .single()

    // ログ
    await supabase.from('message_logs').insert({
      friend_id: friend?.id ?? null,
      platform: 'line',
      direction: 'inbound',
      message_type: null,
      message_content: null,
      source_type: 'webhook',
      sent_at: new Date().toISOString(),
    })

    // friend_added トリガーのシナリオを開始
    if (friend) {
      await startScenariosForTrigger('friend_added', friend.id, supabase)
    }
    return
  }

  // ブロックイベント
  if (event.type === 'unfollow') {
    await supabase
      .from('friends')
      .update({ status: 'blocked' })
      .eq('platform', 'line')
      .eq('platform_user_id', userId)
    return
  }

  // アンケート回答（postback）
  if (event.type === 'postback' && event.postback?.data) {
    const params = new URLSearchParams(event.postback.data)
    const surveyTag = params.get('survey_tag')
    const replyText = params.get('reply') ?? 'ご回答ありがとうございます！'

    if (surveyTag) {
      // 友だちを取得
      const { data: friend } = await supabase
        .from('friends')
        .select('id')
        .eq('platform', 'line')
        .eq('platform_user_id', userId)
        .single()

      if (friend) {
        // タグを探す or 作成
        let { data: tag } = await supabase
          .from('tags')
          .select('id')
          .eq('name', surveyTag)
          .single()

        if (!tag) {
          const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
          const color = colors[Math.floor(Math.random() * colors.length)]
          const { data: newTag } = await supabase
            .from('tags')
            .insert({ name: surveyTag, color })
            .select('id')
            .single()
          tag = newTag
        }

        if (tag) {
          await supabase
            .from('friend_tags')
            .upsert({ friend_id: friend.id, tag_id: tag.id }, { onConflict: 'friend_id,tag_id' })

          // tag_added トリガーのシナリオを起動
          await startScenariosForTagTrigger(tag.id, friend.id, supabase)
        }
      }

      // 返信
      if (event.replyToken) {
        await replyMessage(event.replyToken, [{ type: 'text', text: replyText }])
      }
    }
    return
  }

  // メッセージ受信
  if (event.type === 'message' && event.message?.type === 'text') {
    const text: string = event.message.text ?? ''

    // 友だちのレコード取得 or 作成
    const { data: friend } = await supabase
      .from('friends')
      .upsert({
        platform: 'line',
        platform_user_id: userId,
        status: 'active',
        last_interacted_at: new Date().toISOString(),
      }, { onConflict: 'platform,platform_user_id' })
      .select()
      .single()

    // メッセージログ保存
    await supabase.from('message_logs').insert({
      friend_id: friend?.id ?? null,
      platform: 'line',
      direction: 'inbound',
      message_type: 'text',
      message_content: { type: 'text', text },
      source_type: 'webhook',
      sent_at: new Date().toISOString(),
    })

    // キーワードトリガーのシナリオを確認
    if (friend) {
      await checkKeywordScenarios(text, friend.id, event.replyToken, supabase)
    }
  }
}

async function startScenariosForTrigger(
  triggerType: string,
  friendId: string,
  supabase: Awaited<ReturnType<typeof createAdminClient>>
) {
  const { data: scenarios } = await supabase
    .from('scenarios')
    .select('id')
    .eq('trigger_type', triggerType)
    .eq('is_active', true)

  for (const scenario of scenarios ?? []) {
    await supabase.from('scenario_subscribers').upsert({
      scenario_id: scenario.id,
      friend_id: friendId,
      current_step: 0,
      started_at: new Date().toISOString(),
      next_send_at: new Date().toISOString(),
      status: 'active',
    }, { onConflict: 'scenario_id,friend_id' })
  }
}

async function startScenariosForTagTrigger(
  tagId: string,
  friendId: string,
  supabase: Awaited<ReturnType<typeof createAdminClient>>
) {
  const { data: scenarios } = await supabase
    .from('scenarios')
    .select('id')
    .eq('trigger_type', 'tag_added')
    .eq('trigger_tag_id', tagId)
    .eq('is_active', true)

  for (const scenario of scenarios ?? []) {
    await supabase.from('scenario_subscribers').upsert({
      scenario_id: scenario.id,
      friend_id: friendId,
      current_step: 0,
      started_at: new Date().toISOString(),
      next_send_at: new Date().toISOString(),
      status: 'active',
    }, { onConflict: 'scenario_id,friend_id' })
  }
}

async function checkKeywordScenarios(
  text: string,
  friendId: string,
  replyToken: string,
  supabase: Awaited<ReturnType<typeof createAdminClient>>
) {
  const { data: scenarios } = await supabase
    .from('scenarios')
    .select('id, trigger_keyword')
    .eq('trigger_type', 'keyword')
    .eq('is_active', true)

  for (const scenario of scenarios ?? []) {
    if (scenario.trigger_keyword && text.includes(scenario.trigger_keyword)) {
      await supabase.from('scenario_subscribers').upsert({
        scenario_id: scenario.id,
        friend_id: friendId,
        current_step: 0,
        started_at: new Date().toISOString(),
        next_send_at: new Date().toISOString(),
        status: 'active',
      }, { onConflict: 'scenario_id,friend_id' })
    }
  }
}

// LINE event types
interface LineEvent {
  type: string
  replyToken: string
  source?: { userId?: string }
  message?: { type: string; text?: string }
  postback?: { data: string }
}
