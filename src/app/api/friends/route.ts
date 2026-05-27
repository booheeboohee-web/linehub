import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const platform = searchParams.get('platform')
  const status = searchParams.get('status') ?? 'active'
  const tag_id = searchParams.get('tag_id')
  const search = searchParams.get('search')
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = parseInt(searchParams.get('limit') ?? '20', 10)
  const offset = (page - 1) * limit

  const supabase = await createAdminClient()

  // タグフィルターがある場合、対象の friend_id を先に取得
  let filteredIds: string[] | null = null
  if (tag_id) {
    const { data: taggedFriends } = await supabase
      .from('friend_tags')
      .select('friend_id')
      .eq('tag_id', tag_id)
    filteredIds = taggedFriends?.map((f) => f.friend_id) ?? []
    if (filteredIds.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, limit })
    }
  }

  let query = supabase
    .from('friends')
    .select('*, tags:friend_tags(tag:tags(*))', { count: 'exact' })
    .eq('status', status)
    .order('followed_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (platform) query = query.eq('platform', platform)
  if (search) query = query.ilike('display_name', `%${search}%`)
  if (filteredIds) query = query.in('id', filteredIds)

  const { data, error, count } = await query

  if (error) {
    console.error('GET /api/friends error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // タグを整形（ネストされた形式をフラットに）
  const friends = (data ?? []).map((f) => ({
    ...f,
    tags: (f.tags as Array<{ tag: { id: string; name: string; color: string; created_at: string } | null }>)
      ?.map((ft) => ft.tag)
      .filter(Boolean) ?? [],
  }))

  return NextResponse.json({ data: friends, total: count ?? 0, page, limit })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { display_name, email, phone, note, platform } = body

  // 手動追加は email/email のみ
  if (!platform || !['email'].includes(platform)) {
    return NextResponse.json(
      { error: 'platform は email のみ手動追加できます' },
      { status: 400 }
    )
  }
  if (!email && !phone) {
    return NextResponse.json(
      { error: 'email または phone が必要です' },
      { status: 400 }
    )
  }

  const platform_user_id = email ?? phone ?? `manual_${Date.now()}`

  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('friends')
    .insert({
      platform,
      platform_user_id,
      display_name: display_name ?? null,
      email: email ?? null,
      phone: phone ?? null,
      note: note ?? null,
      status: 'active',
      followed_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/friends error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
