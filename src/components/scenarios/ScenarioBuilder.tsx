'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, ChevronUp, ChevronDown, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Scenario, ScenarioStep, Platform, ScenarioTrigger, MessageType } from '@/types/database'

interface Props {
  scenario: Scenario | null
  onClose: () => void
  onSaved: (scenario: Scenario) => void
}

interface StepDraft {
  id?: string
  step_order: number
  delay_days: number
  delay_hours: number
  message_type: MessageType
  text: string
}

const PLATFORMS: { value: Platform | 'all'; label: string }[] = [
  { value: 'line', label: 'LINE' },
  { value: 'email', label: 'メール' },
  { value: 'all', label: '全プラットフォーム' },
]

const TRIGGERS: { value: ScenarioTrigger; label: string }[] = [
  { value: 'friend_added', label: '友だち追加時' },
  { value: 'keyword', label: 'キーワード' },
  { value: 'manual', label: '手動' },
]

function stepsToStepDrafts(steps: ScenarioStep[]): StepDraft[] {
  return [...steps]
    .sort((a, b) => a.step_order - b.step_order)
    .map((s) => ({
      id: s.id,
      step_order: s.step_order,
      delay_days: s.delay_days,
      delay_hours: s.delay_hours,
      message_type: s.message_type,
      text:
        s.message_type === 'text' && typeof (s.message_content as { text?: string }).text === 'string'
          ? (s.message_content as { text: string }).text
          : '',
    }))
}

export default function ScenarioBuilder({ scenario, onClose, onSaved }: Props) {
  const [name, setName] = useState(scenario?.name ?? '')
  const [description, setDescription] = useState(scenario?.description ?? '')
  const [platform, setPlatform] = useState<Platform | 'all'>(scenario?.platform ?? 'line')
  const [triggerType, setTriggerType] = useState<ScenarioTrigger>(
    scenario?.trigger_type ?? 'friend_added'
  )
  const [triggerKeyword, setTriggerKeyword] = useState(scenario?.trigger_keyword ?? '')
  const [isActive, setIsActive] = useState(scenario?.is_active ?? false)
  const [steps, setSteps] = useState<StepDraft[]>(
    scenario?.steps ? stepsToStepDrafts(scenario.steps) : []
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        step_order: prev.length,
        delay_days: 0,
        delay_hours: 0,
        message_type: 'text',
        text: '',
      },
    ])
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_order: i })))
  }

  function moveStep(index: number, direction: 'up' | 'down') {
    setSteps((prev) => {
      const next = [...prev]
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((s, i) => ({ ...s, step_order: i }))
    })
  }

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('シナリオ名を入力してください')
      return
    }
    setSaving(true)
    setError(null)

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        platform,
        trigger_type: triggerType,
        trigger_keyword: triggerType === 'keyword' ? triggerKeyword.trim() || null : null,
        is_active: isActive,
      }

      let scenarioId = scenario?.id
      let savedScenario: Scenario

      if (scenarioId) {
        const res = await fetch(`/api/scenarios/${scenarioId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to update scenario')
        savedScenario = (await res.json()).data
      } else {
        const res = await fetch('/api/scenarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to create scenario')
        savedScenario = (await res.json()).data
        scenarioId = savedScenario.id
      }

      // Sync steps: delete removed, update/create others
      const originalIds = new Set(scenario?.steps?.map((s) => s.id) ?? [])
      const currentIds = new Set(steps.filter((s) => s.id).map((s) => s.id!))
      const deletedIds = [...originalIds].filter((id) => !currentIds.has(id))

      // Delete removed steps
      await Promise.all(
        deletedIds.map((stepId) =>
          fetch(`/api/scenarios/${scenarioId}/steps/${stepId}`, { method: 'DELETE' })
        )
      )

      // Update or create steps in order
      const savedSteps: ScenarioStep[] = []
      for (const step of steps) {
        const stepPayload = {
          step_order: step.step_order,
          delay_days: step.delay_days,
          delay_hours: step.delay_hours,
          message_type: step.message_type,
          message_content:
            step.message_type === 'text'
              ? { type: 'text', text: step.text }
              : { type: step.message_type },
        }

        if (step.id) {
          const res = await fetch(`/api/scenarios/${scenarioId}/steps/${step.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(stepPayload),
          })
          if (res.ok) savedSteps.push((await res.json()).data)
        } else {
          const res = await fetch(`/api/scenarios/${scenarioId}/steps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(stepPayload),
          })
          if (res.ok) savedSteps.push((await res.json()).data)
        }
      }

      onSaved({ ...savedScenario, steps: savedSteps })
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 m-auto w-full max-w-5xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {scenario ? 'シナリオ編集' : '新規シナリオ作成'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left pane: basic settings */}
          <div className="w-80 flex-shrink-0 border-r border-gray-200 overflow-y-auto p-6 space-y-5">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              基本設定
            </h3>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                シナリオ名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 友だち追加後シナリオ"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="シナリオの説明（任意）"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            {/* Platform */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                プラットフォーム
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform | 'all')}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Trigger type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                トリガー種別
              </label>
              <div className="space-y-2">
                {TRIGGERS.map((t) => (
                  <label key={t.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="trigger_type"
                      value={t.value}
                      checked={triggerType === t.value}
                      onChange={() => setTriggerType(t.value)}
                      className="text-indigo-600"
                    />
                    <span className="text-sm text-gray-700">{t.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Keyword input (only when keyword trigger) */}
            {triggerType === 'keyword' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  トリガーキーワード
                </label>
                <input
                  type="text"
                  value={triggerKeyword}
                  onChange={(e) => setTriggerKeyword(e.target.value)}
                  placeholder="例: 資料請求"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            {/* Active toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">シナリオを有効にする</span>
              <button
                type="button"
                onClick={() => setIsActive((v) => !v)}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  isActive ? 'bg-indigo-600' : 'bg-gray-300'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                    isActive ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>
          </div>

          {/* Right pane: step builder */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                ステップ ({steps.length})
              </h3>
              <button
                onClick={addStep}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                ステップ追加
              </button>
            </div>

            {steps.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
                <p className="text-sm">ステップがありません</p>
                <p className="text-xs mt-1">「ステップ追加」ボタンから追加してください</p>
              </div>
            ) : (
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div
                    key={index}
                    className="bg-gray-50 border border-gray-200 rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-gray-700">
                        ステップ {index + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveStep(index, 'up')}
                          disabled={index === 0}
                          className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 hover:bg-gray-200 rounded transition-colors"
                          title="上へ"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => moveStep(index, 'down')}
                          disabled={index === steps.length - 1}
                          className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 hover:bg-gray-200 rounded transition-colors"
                          title="下へ"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => removeStep(index)}
                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Delay */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          待機日数
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            value={step.delay_days}
                            onChange={(e) =>
                              updateStep(index, { delay_days: parseInt(e.target.value) || 0 })
                            }
                            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <span className="text-xs text-gray-500 flex-shrink-0">日後</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          待機時間
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={23}
                            value={step.delay_hours}
                            onChange={(e) =>
                              updateStep(index, { delay_hours: parseInt(e.target.value) || 0 })
                            }
                            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <span className="text-xs text-gray-500 flex-shrink-0">時間後</span>
                        </div>
                      </div>
                    </div>

                    {/* Message type */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        メッセージタイプ
                      </label>
                      <select
                        value={step.message_type}
                        onChange={(e) =>
                          updateStep(index, { message_type: e.target.value as MessageType })
                        }
                        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="text">テキスト</option>
                        <option value="image">画像</option>
                      </select>
                    </div>

                    {/* Message content */}
                    {step.message_type === 'text' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          テキストメッセージ
                        </label>
                        <textarea
                          value={step.text}
                          onChange={(e) => updateStep(index, { text: e.target.value })}
                          placeholder="送信するメッセージを入力..."
                          rows={3}
                          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        />
                      </div>
                    )}
                    {step.message_type === 'image' && (
                      <p className="text-xs text-gray-400 italic">
                        画像メッセージは APIから設定してください
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
