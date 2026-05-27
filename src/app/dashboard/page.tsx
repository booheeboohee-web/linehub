import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase/server'
import { platformLabel, platformColor } from '@/lib/utils'
import {
  Users,
  UserPlus,
  MessageSquare,
  GitBranch,
} from 'lucide-react'

export const revalidate = 0

async function getStats() {
  const supabase = await createClient()

  // 総友だち数
  const { count: totalFriends } = await supabase
    .from('friends')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  // 今月の新規友だち
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const { count: newFriends } = await supabase
    .from('friends')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')
    .gte('followed_at', startOfMonth.toISOString())

  // 送信メッセージ数
  const { count: sentMessages } = await supabase
    .from('message_logs')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'outbound')

  // 稼働中シナリオ数
  const { count: activeScenarios } = await supabase
    .from('scenarios')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  return {
    totalFriends: totalFriends ?? 0,
    newFriends: newFriends ?? 0,
    sentMessages: sentMessages ?? 0,
    activeScenarios: activeScenarios ?? 0,
  }
}

async function getRecentBroadcasts() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('broadcasts')
    .select('id, name, platform, status, sent_count, total_targets, sent_at, created_at')
    .order('created_at', { ascending: false })
    .limit(5)
  return data ?? []
}

async function getPlatformStats() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('friends')
    .select('platform')
    .eq('status', 'active')

  if (!data) return []

  const counts: Record<string, number> = {}
  for (const row of data) {
    counts[row.platform] = (counts[row.platform] ?? 0) + 1
  }
  const total = data.length

  return Object.entries(counts).map(([platform, count]) => ({
    platform,
    count,
    total,
    pct: total > 0 ? Math.round((count / total) * 100) : 0,
  }))
}

const barColors: Record<string, string> = {
  line: 'bg-green-500',
  instagram: 'bg-pink-500',
  email: 'bg-blue-500',
}

export default async function DashboardPage() {
  const [stats, broadcasts, platformStats] = await Promise.all([
    getStats(),
    getRecentBroadcasts(),
    getPlatformStats(),
  ])

  const statCards = [
    {
      label: '総友だち数',
      value: stats.totalFriends.toLocaleString(),
      icon: Users,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      label: '今月の新規友だち',
      value: stats.newFriends.toLocaleString(),
      icon: UserPlus,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      label: '送信メッセージ数',
      value: stats.sentMessages.toLocaleString(),
      icon: MessageSquare,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'シナリオ稼働中',
      value: stats.activeScenarios.toLocaleString(),
      icon: GitBranch,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">ダッシュボード</h2>
        <p className="mt-1 text-sm text-slate-500">
          マーケティング活動の概要をご確認ください
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{stat.value}</p>
                </div>
                <div className={`rounded-lg p-2.5 ${stat.bg}`}>
                  <Icon size={20} className={stat.color} />
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Lower section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent broadcasts */}
        <Card className="lg:col-span-2">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="font-semibold text-slate-900">最近の配信</h3>
          </div>
          {broadcasts.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              配信履歴がありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-3">配信名</th>
                    <th className="px-6 py-3">プラットフォーム</th>
                    <th className="px-6 py-3 text-right">件数</th>
                    <th className="px-6 py-3">ステータス</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {broadcasts.map((b) => (
                    <tr key={b.id} className="text-sm hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-900 max-w-[180px] truncate">
                        {b.name}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${platformColor(b.platform)}`}>
                          {platformLabel(b.platform)}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right text-slate-700">
                        {b.status === 'done'
                          ? `${(b.sent_count ?? 0).toLocaleString()} 人`
                          : `対象 ${(b.total_targets ?? 0).toLocaleString()} 人`}
                      </td>
                      <td className="px-6 py-3">
                        {b.status === 'done' && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">完了</span>
                        )}
                        {b.status === 'draft' && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">下書き</span>
                        )}
                        {b.status === 'scheduled' && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">予約済み</span>
                        )}
                        {b.status === 'sending' && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">送信中</span>
                        )}
                        {b.status === 'error' && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">エラー</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Platform breakdown */}
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900">プラットフォーム別友だち数</h3>
          <p className="mt-1 text-sm text-slate-500">
            総計 {stats.totalFriends.toLocaleString()} 人
          </p>

          {platformStats.length === 0 ? (
            <p className="mt-6 text-sm text-slate-400 text-center">データがありません</p>
          ) : (
            <div className="mt-6 space-y-5">
              {platformStats.map((ps) => (
                <div key={ps.platform}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${platformColor(ps.platform)}`}>
                      {platformLabel(ps.platform)}
                    </span>
                    <span className="font-medium text-slate-700">
                      {ps.count.toLocaleString()} 人
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${barColors[ps.platform] ?? 'bg-slate-400'} transition-all duration-500`}
                      style={{ width: `${ps.pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right text-xs text-slate-400">{ps.pct}%</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
