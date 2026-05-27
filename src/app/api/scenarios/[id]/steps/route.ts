import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('scenario_steps')
    .select('*')
    .eq('scenario_id', id)
    .order('step_order', { ascending: true })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ data })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createAdminClient()

  const body = await request.json()
  const { step_order, delay_days, delay_hours, message_type, message_content } = body

  if (message_type === undefined || message_content === undefined) {
    return Response.json({ error: 'message_type and message_content are required' }, { status: 400 })
  }

  // Determine step_order if not provided
  let order = step_order
  if (order === undefined) {
    const { data: existing } = await supabase
      .from('scenario_steps')
      .select('step_order')
      .eq('scenario_id', id)
      .order('step_order', { ascending: false })
      .limit(1)
    order = existing && existing.length > 0 ? existing[0].step_order + 1 : 0
  }

  const { data, error } = await supabase
    .from('scenario_steps')
    .insert({
      scenario_id: id,
      step_order: order,
      delay_days: delay_days ?? 0,
      delay_hours: delay_hours ?? 0,
      message_type,
      message_content,
    })
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ data }, { status: 201 })
}
