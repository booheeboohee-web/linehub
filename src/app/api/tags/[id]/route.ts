import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { name, color } = body

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (color !== undefined) updates.color = color

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '更新フィールドがありません' }, { status: 400 })
  }

  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('tags')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'そのタグ名はすでに存在します' }, { status: 409 })
    }
    console.error('PATCH /api/tags/[id] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createAdminClient()
  const force = new URL(req.url).searchParams.get('force') === 'true'

  // シナリオのトリガーとして使われているか確認
  const { data: usedScenarios } = await supabase
    .from('scenarios')
    .select('id, name')
    .eq('trigger_tag_id', id)

  if (!force && usedScenarios && usedScenarios.length > 0) {
    return NextResponse.json(
      {
        error: 'このタグはシナリオのトリガーとして使用されています',
        scenarios: usedScenarios,
      },
      { status: 409 }
    )
  }

  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('DELETE /api/tags/[id] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
