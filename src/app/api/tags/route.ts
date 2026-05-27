import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('GET /api/tags error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, color } = body

  if (!name) {
    return NextResponse.json({ error: 'name が必要です' }, { status: 400 })
  }

  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('tags')
    .insert({ name, color: color ?? '#6366f1' })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'そのタグ名はすでに存在します' }, { status: 409 })
    }
    console.error('POST /api/tags error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
