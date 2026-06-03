import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { pushMessage } from '@/lib/line'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { message } = await req.json()

  if (!message?.trim()) {
    return NextResponse.json({ error: 'メッセージを入力してください' }, { status: 400 })
  }

  const supabase = await createAdminClient()

  const { data: friend, error } = await supabase
    .from('friends')
    .select('id, platform, platform_user_id, status')
    .eq('id', id)
    .single()

  if (error || !friend) {
    return NextResponse.json({ error: '友だちが見つかりません' }, { status: 404 })
  }
  if (friend.status !== 'active') {
    return NextResponse.json({ error: 'この友だちにはメッセージを送れません' }, { status: 400 })
  }

  try {
    if (friend.platform === 'line') {
      await pushMessage(friend.platform_user_id, [{ type: 'text', text: message.trim() }])
    }

    // ログ記録
    await supabase.from('message_logs').insert({
      friend_id: friend.id,
      platform: friend.platform,
      direction: 'outbound',
      message_type: 'text',
      message_content: { type: 'text', text: message.trim() },
      source_type: 'manual',
      status: 'sent',
      sent_at: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
