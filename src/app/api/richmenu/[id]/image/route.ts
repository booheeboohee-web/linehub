import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { uploadRichMenuImage } from '@/lib/line'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createAdminClient()

  const { data: menu } = await supabase
    .from('rich_menus')
    .select('line_rich_menu_id')
    .eq('id', id)
    .single()

  if (!menu?.line_rich_menu_id) {
    return NextResponse.json({ error: '先にLINEに適用してください' }, { status: 400 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'ファイルがありません' }, { status: 400 })

  const contentType = file.type // 'image/jpeg' or 'image/png'
  const arrayBuffer = await file.arrayBuffer()
  const imageBuffer = new Uint8Array(arrayBuffer)

  const ok = await uploadRichMenuImage(menu.line_rich_menu_id, imageBuffer, contentType)
  if (!ok) return NextResponse.json({ error: '画像のアップロードに失敗しました' }, { status: 500 })

  // Store a placeholder so we know image was uploaded
  await supabase
    .from('rich_menus')
    .update({ image_url: `line://richmenu-image/${menu.line_rich_menu_id}` })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
