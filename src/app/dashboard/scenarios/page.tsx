import { createAdminClient } from '@/lib/supabase/server'
import ScenarioList from '@/components/scenarios/ScenarioList'
import type { Scenario } from '@/types/database'

export default async function ScenariosPage() {
  const supabase = await createAdminClient()

  const { data: scenarios } = await supabase
    .from('scenarios')
    .select(`
      *,
      steps:scenario_steps(*)
    `)
    .order('created_at', { ascending: false })

  // Fetch subscriber counts per scenario
  const { data: subscriberCounts } = await supabase
    .from('scenario_subscribers')
    .select('scenario_id')
    .eq('status', 'active')

  const countMap: Record<string, number> = {}
  for (const row of subscriberCounts ?? []) {
    countMap[row.scenario_id] = (countMap[row.scenario_id] ?? 0) + 1
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">シナリオ配信</h1>
          <p className="mt-1 text-sm text-gray-500">
            友だち追加・キーワード・手動トリガーで自動送信するシナリオを管理します
          </p>
        </div>
        <ScenarioList
          initialScenarios={(scenarios as Scenario[]) ?? []}
          subscriberCounts={countMap}
        />
      </div>
    </div>
  )
}
