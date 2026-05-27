import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const { id, stepId } = await params
  const supabase = await createAdminClient()

  const body = await request.json()

  const { data, error } = await supabase
    .from('scenario_steps')
    .update(body)
    .eq('id', stepId)
    .eq('scenario_id', id)
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })
  }

  return Response.json({ data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const { id, stepId } = await params
  const supabase = await createAdminClient()

  const { error } = await supabase
    .from('scenario_steps')
    .delete()
    .eq('id', stepId)
    .eq('scenario_id', id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
