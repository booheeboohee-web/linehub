import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('friends')
    .select('*, tags:friend_tags(tag:tags(*))')
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  const friend = {
    ...data,
    tags: (data.tags as Array<{ tag: { id: string; name: string; color: string; created_at: string } | null }>)
      ?.map((ft) => ft.tag)
      .filter(Boolean) ?? [],
  }

  // 直近のメッセージ履歴を取得
  const { data: logs } = await supabase
    .from('message_logs')
    .select('*')
    .eq('friend_id', id)
    .order('sent_at', { ascending: false })
    .limit(5)

  return NextResponse.json({ data: friend, logs: logs ?? [] })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  // 許可するフィールドのみ
  const allowedFields = ['note', 'phone', 'email', 'display_name']
  const updates: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '更新フィールドがありません' }, { status: 400 })
  }

  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('friends')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('PATCH /api/friends/[id] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createAdminClient()

  const { error } = await supabase
    .from('friends')
    .update({ status: 'deleted' })
    .eq('id', id)

  if (error) {
    console.error('DELETE /api/friends/[id] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
