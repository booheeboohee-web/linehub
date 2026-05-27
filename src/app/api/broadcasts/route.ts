import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('broadcasts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = await createAdminClient()

  const body = await request.json()
  const {
    name,
    platform,
    message_type,
    message_content,
    target_type,
    target_tag_ids,
    scheduled_at,
  } = body

  if (!name || !platform || !message_type || !message_content || !target_type) {
    return Response.json(
      { error: 'name, platform, message_type, message_content, target_type are required' },
      { status: 400 }
    )
  }

  const status = scheduled_at ? 'scheduled' : 'draft'

  const { data, error } = await supabase
    .from('broadcasts')
    .insert({
      name,
      platform,
      message_type,
      message_content,
      target_type,
      target_tag_ids: target_tag_ids ?? null,
      status,
      scheduled_at: scheduled_at ?? null,
      sent_at: null,
      total_targets: 0,
      sent_count: 0,
      error_count: 0,
    })
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ data }, { status: 201 })
}
