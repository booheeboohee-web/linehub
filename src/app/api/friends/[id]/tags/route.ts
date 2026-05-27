import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: friend_id } = await params
  const body = await req.json()
  const { tag_id } = body

  if (!tag_id) {
    return NextResponse.json({ error: 'tag_id が必要です' }, { status: 400 })
  }

  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('friend_tags')
    .insert({ friend_id, tag_id, created_at: new Date().toISOString() })
    .select()
    .single()

  if (error) {
    // 重複の場合は 409
    if (error.code === '23505') {
      return NextResponse.json({ error: 'すでに追加されています' }, { status: 409 })
    }
    console.error('POST /api/friends/[id]/tags error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: friend_id } = await params
  const body = await req.json()
  const { tag_id } = body

  if (!tag_id) {
    return NextResponse.json({ error: 'tag_id が必要です' }, { status: 400 })
  }

  const supabase = await createAdminClient()

  const { error } = await supabase
    .from('friend_tags')
    .delete()
    .eq('friend_id', friend_id)
    .eq('tag_id', tag_id)

  if (error) {
    console.error('DELETE /api/friends/[id]/tags error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
