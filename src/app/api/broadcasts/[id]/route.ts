import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('broadcasts')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })
  }

  return Response.json({ data })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createAdminClient()

  const body = await request.json()

  const { data, error } = await supabase
    .from('broadcasts')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })
  }

  return Response.json({ data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createAdminClient()

  // Only allow deletion of draft broadcasts
  const { data: broadcast, error: fetchError } = await supabase
    .from('broadcasts')
    .select('status')
    .eq('id', id)
    .single()

  if (fetchError) {
    return Response.json({ error: fetchError.message }, { status: fetchError.code === 'PGRST116' ? 404 : 500 })
  }

  if (broadcast.status !== 'draft') {
    return Response.json({ error: 'Only draft broadcasts can be deleted' }, { status: 400 })
  }

  const { error } = await supabase
    .from('broadcasts')
    .delete()
    .eq('id', id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
