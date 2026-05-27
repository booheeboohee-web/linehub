import { createAdminClient } from '@/lib/supabase/server'
import { RichMenuList } from '@/components/richmenu/RichMenuList'
import type { RichMenu } from '@/types/database'

export default async function RichMenuPage() {
  const supabase = await createAdminClient()
  const { data } = await supabase
    .from('rich_menus')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">リッチメニュー管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          LINEのリッチメニューを作成・管理します
        </p>
      </div>
      <RichMenuList initialMenus={(data as RichMenu[]) ?? []} />
    </div>
  )
}
