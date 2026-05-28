import { Card } from '@/components/ui/Card'
import { createAdminClient } from '@/lib/supabase/server'
import { Users, MessageSquare, UserMinus, TrendingDown } from 'lucide-react'

export const revalidate = 0

function groupByDate(items: { date: string }[]): Record<string, number> {
  const counts: Record<string, number> = {}
  items.forEach(item => {
    const d = item.date.slice(0, 10)
    counts[d] = (counts[d] ?? 0) + 1
  })
  return counts
}

function last14Days(): string[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - 13 + i)
    return d.toISOString().slice(0, 10)
  })
}

interface BarChartProps {
  days: string[]
  countsByDate: Record<string, number>
  color: string
}

function BarChart({ days, countsByDate, color }: BarChartProps) {
  const counts = days.map(d => countsByDate[d] ?? 0)
  const maxCount = Math.max(...counts, 1)

  return (
    <div className="flex items-end gap-1 h-32 pt-4">
      {days.map((day, i) => {
        const count = counts[i]
        const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0
        return (
          <div key={day} className="flex flex-col items-center flex-1 gap-1 min-w-0">
            <span className="text-xs text-slate-500 leading-none">{count > 0 ? count : ''}</span>
            <div
              className="w-full rounded-t transition-all"
              style={{
                height: `${heightPct}%`,
                backgroundColor: color,
                minHeight: '2px',
              }}
            />
            <span
              className="text-[10px] text-slate-400 whitespace-nowrap"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '9px' }}
            >
              {day.slice(5)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default async function AnalyticsPage() {
  const supabase = await createAdminClient()

  const since14 = new Date()
  since14.setDate(since14.getDate() - 14)

  const [
    { count: totalFriends },
    { count: totalMessages },
    { count: blockedCount },
    { data: friendsByDayRaw },
    { data: messagesByDayRaw },
    { data: tagStatsRaw },
  ] = await Promise.all([
    supabase.from('friends').select('*', { count: 'exact', head: true }),
    supabase
      .from('message_logs')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound'),
    supabase
      .from('friends')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'blocked'),
    supabase
      .from('friends')
      .select('followed_at')
      .gte('followed_at', since14.toISOString()),
    supabase
      .from('message_logs')
      .select('sent_at')
      .eq('direction', 'outbound')
      .gte('sent_at', since14.toISOString()),
    supabase
      .from('friend_tags')
      .select('tag_id, tag:tags(name, color)'),
  ])

  const days = last14Days()

  const friendCountsByDate = groupByDate(
    (friendsByDayRaw ?? []).map(f => ({ date: f.followed_at }))
  )
  const messageCountsByDate = groupByDate(
    (messagesByDayRaw ?? []).map(m => ({ date: m.sent_at }))
  )

  // Build tag distribution
  const tagMap: Record<string, { name: string; color: string; count: number }> = {}
  ;(tagStatsRaw ?? []).forEach((row: { tag_id: string; tag: { name: string; color: string } | null }) => {
    if (!row.tag) return
    if (!tagMap[row.tag_id]) {
      tagMap[row.tag_id] = { name: row.tag.name, color: row.tag.color, count: 0 }
    }
    tagMap[row.tag_id].count++
  })
  const tagDistribution = Object.entries(tagMap)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.count - a.count)
  const maxTagCount = Math.max(...tagDistribution.map(t => t.count), 1)

  const tf = totalFriends ?? 0
  const tm = totalMessages ?? 0
  const bc = blockedCount ?? 0
  const blockRate = tf > 0 ? ((bc / tf) * 100).toFixed(1) : '0.0'

  const summaryCards = [
    {
      label: '総友だち数',
      value: tf.toLocaleString(),
      icon: Users,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
    },
    {
      label: '総配信数',
      value: tm.toLocaleString(),
      icon: MessageSquare,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'ブロック数',
      value: bc.toLocaleString(),
      icon: UserMinus,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      label: 'ブロック率',
      value: `${blockRate}%`,
      icon: TrendingDown,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">分析レポート</h2>
        <p className="mt-1 text-sm text-slate-500">
          配信実績と友だちの状況を確認できます
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{card.value}</p>
                </div>
                <div className={`rounded-lg p-2.5 ${card.bg}`}>
                  <Icon size={20} className={card.color} />
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Friends acquired chart */}
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900">友だち獲得推移（過去14日間）</h3>
          <p className="mt-1 text-sm text-slate-500">新規友だち数の日別グラフ</p>
          {(friendsByDayRaw ?? []).length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-slate-400 mt-4">
              データがありません
            </div>
          ) : (
            <div className="mt-4">
              <BarChart
                days={days}
                countsByDate={friendCountsByDate}
                color="#6366f1"
              />
            </div>
          )}
        </Card>

        {/* Messages sent chart */}
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900">メッセージ配信推移（過去14日間）</h3>
          <p className="mt-1 text-sm text-slate-500">配信メッセージ数の日別グラフ</p>
          {(messagesByDayRaw ?? []).length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-slate-400 mt-4">
              データがありません
            </div>
          ) : (
            <div className="mt-4">
              <BarChart
                days={days}
                countsByDate={messageCountsByDate}
                color="#22c55e"
              />
            </div>
          )}
        </Card>
      </div>

      {/* Tag distribution */}
      <Card className="p-6">
        <h3 className="font-semibold text-slate-900">タグ別友だち分布</h3>
        <p className="mt-1 text-sm text-slate-500">タグごとの友だち数</p>

        {tagDistribution.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center py-8 text-slate-400">
            <p className="text-sm">タグが設定されていません</p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {tagDistribution.map(tag => (
              <div key={tag.id} className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="w-28 text-sm text-slate-700 truncate">{tag.name}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${(tag.count / maxTagCount) * 100}%`,
                      backgroundColor: tag.color,
                    }}
                  />
                </div>
                <span className="text-sm text-slate-500 w-10 text-right">{tag.count}人</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
