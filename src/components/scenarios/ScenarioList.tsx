'use client'

import { useState } from 'react'
import { GitBranch, Plus, Pencil, Users, ToggleLeft, ToggleRight } from 'lucide-react'
import { cn, platformLabel, platformColor } from '@/lib/utils'
import type { Scenario } from '@/types/database'
import ScenarioBuilder from './ScenarioBuilder'

interface Props {
  initialScenarios: Scenario[]
  subscriberCounts: Record<string, number>
}

const triggerLabel: Record<string, string> = {
  friend_added: '友だち追加時',
  keyword: 'キーワード',
  tag_added: 'タグ追加時',
  manual: '手動',
}

const triggerColor: Record<string, string> = {
  friend_added: 'bg-emerald-100 text-emerald-800',
  keyword: 'bg-yellow-100 text-yellow-800',
  tag_added: 'bg-indigo-100 text-indigo-800',
  manual: 'bg-gray-100 text-gray-700',
}

export default function ScenarioList({ initialScenarios, subscriberCounts }: Props) {
  const [scenarios, setScenarios] = useState<Scenario[]>(initialScenarios)
  const [editingScenario, setEditingScenario] = useState<Scenario | null | 'new'>(null)

  async function toggleActive(scenario: Scenario) {
    const res = await fetch(`/api/scenarios/${scenario.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !scenario.is_active }),
    })
    if (res.ok) {
      const { data } = await res.json()
      setScenarios((prev) => prev.map((s) => (s.id === data.id ? { ...s, ...data } : s)))
    }
  }

  function handleSaved(scenario: Scenario) {
    setScenarios((prev) => {
      const idx = prev.findIndex((s) => s.id === scenario.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = scenario
        return next
      }
      return [scenario, ...prev]
    })
    setEditingScenario(null)
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setEditingScenario('new')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新規シナリオ作成
        </button>
      </div>

      {scenarios.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">シナリオがありません</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {scenarios.map((scenario) => (
            <div
              key={scenario.id}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <h3 className="font-semibold text-gray-900 text-base truncate">
                      {scenario.name}
                    </h3>
                    <span
                      className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        triggerColor[scenario.trigger_type] ?? 'bg-gray-100 text-gray-700'
                      )}
                    >
                      {triggerLabel[scenario.trigger_type] ?? scenario.trigger_type}
                    </span>
                    <span
                      className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        platformColor(scenario.platform)
                      )}
                    >
                      {platformLabel(scenario.platform)}
                    </span>
                  </div>

                  {scenario.description && (
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">{scenario.description}</p>
                  )}

                  {scenario.trigger_keyword && (
                    <p className="text-xs text-gray-400 mb-3">
                      キーワード:{' '}
                      <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                        {scenario.trigger_keyword}
                      </span>
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <GitBranch className="w-4 h-4" />
                      {scenario.steps?.length ?? 0} ステップ
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {subscriberCounts[scenario.id] ?? 0} 人
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <button
                    onClick={() => toggleActive(scenario)}
                    className={cn(
                      'flex items-center gap-1.5 text-sm font-medium transition-colors',
                      scenario.is_active ? 'text-indigo-600' : 'text-gray-400'
                    )}
                    title={scenario.is_active ? '無効にする' : '有効にする'}
                  >
                    {scenario.is_active ? (
                      <ToggleRight className="w-8 h-8" />
                    ) : (
                      <ToggleLeft className="w-8 h-8" />
                    )}
                    <span className="hidden sm:inline">
                      {scenario.is_active ? '有効' : '無効'}
                    </span>
                  </button>

                  <button
                    onClick={() => setEditingScenario(scenario)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    編集
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingScenario !== null && (
        <ScenarioBuilder
          scenario={editingScenario === 'new' ? null : editingScenario}
          onClose={() => setEditingScenario(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
