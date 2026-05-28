import { NextRequest, NextResponse } from 'next/server'
import { createRichMenu, setDefaultRichMenu, createRichMenuAlias } from '@/lib/line'
import { createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createAdminClient()

  // Fetch the rich menu from DB
  const { data: menu, error: fetchError } = await supabase
    .from('rich_menus')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !menu) {
    return NextResponse.json({ error: 'Rich menu not found' }, { status: 404 })
  }

  try {
    // Create rich menu on LINE
    const linePayload = {
      size: { width: menu.size_width, height: menu.size_height },
      selected: menu.selected,
      name: menu.name,
      chatBarText: menu.chat_bar_text,
      areas: menu.areas,
    }

    const result = await createRichMenu(linePayload)
    const lineRichMenuId: string = result.richMenuId

    // Create LINE alias so other menus can reference this one via richmenuswitch
    const aliasId = `richmenu-alias-${id.slice(0, 8)}`
    try {
      await createRichMenuAlias(aliasId, lineRichMenuId)
    } catch (aliasErr) {
      console.warn('Alias creation failed (non-fatal):', aliasErr)
    }

    // Set as default for all users
    await setDefaultRichMenu(lineRichMenuId)

    // Update DB: set this menu active, deactivate others
    await supabase.from('rich_menus').update({ is_active: false, is_default: false }).neq('id', id)

    const { data: updated, error: updateError } = await supabase
      .from('rich_menus')
      .update({
        line_rich_menu_id: lineRichMenuId,
        is_active: true,
        is_default: true,
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('Activate rich menu error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
