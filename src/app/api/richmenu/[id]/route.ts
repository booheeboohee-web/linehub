import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { deleteRichMenu } from '@/lib/line'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createAdminClient()
  const { data, error } = await supabase
    .from('rich_menus')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await req.json()
  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('rich_menus')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createAdminClient()

  // Get the menu to check if it has a LINE rich menu ID
  const { data: menu, error: fetchError } = await supabase
    .from('rich_menus')
    .select('line_rich_menu_id')
    .eq('id', id)
    .single()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 404 })

  // Delete from LINE if it has been registered
  if (menu.line_rich_menu_id) {
    try {
      await deleteRichMenu(menu.line_rich_menu_id)
    } catch (err) {
      console.error('LINE rich menu delete error:', err)
    }
  }

  const { error } = await supabase.from('rich_menus').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
