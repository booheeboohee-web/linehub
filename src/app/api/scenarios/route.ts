import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('scenarios')
    .select(`
      *,
      steps:scenario_steps(*)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = await createAdminClient()

  const body = await request.json()
  const { name, description, platform, trigger_type, trigger_keyword, is_active } = body

  if (!name || !platform || !trigger_type) {
    return Response.json({ error: 'name, platform, trigger_type are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('scenarios')
    .insert({
      name,
      description: description ?? null,
      platform,
      trigger_type,
      trigger_keyword: trigger_keyword ?? null,
      trigger_tag_id: null,
      is_active: is_active ?? false,
    })
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ data }, { status: 201 })
}
