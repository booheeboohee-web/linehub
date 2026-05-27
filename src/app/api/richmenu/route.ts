import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createAdminClient()
  const { data, error } = await supabase
    .from('rich_menus')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, chat_bar_text, size_width, size_height, areas, image_url } = body

  if (!name || !chat_bar_text) {
    return NextResponse.json({ error: 'name and chat_bar_text are required' }, { status: 400 })
  }

  const supabase = await createAdminClient()
  const { data, error } = await supabase
    .from('rich_menus')
    .insert({
      name,
      chat_bar_text,
      size_width: size_width ?? 2500,
      size_height: size_height ?? 1686,
      selected: false,
      areas: areas ?? [],
      image_url: image_url ?? null,
      line_rich_menu_id: null,
      is_default: false,
      is_active: false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
