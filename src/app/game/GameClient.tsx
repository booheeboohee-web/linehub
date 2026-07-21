'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Game, ButtonName } from './engine/engine'

const noopSubscribe = () => () => {}
const useIsTouch = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    () => false
  )

export default function GameClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [muted, setMuted] = useState(false)
  const isTouch = useIsTouch()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const game = new Game(canvas)
    gameRef.current = game
    ;(window as unknown as { __ffGame?: Game }).__ffGame = game
    return () => {
      game.destroy()
      gameRef.current = null
    }
  }, [])

  const press = (btn: ButtonName) => (e: React.PointerEvent) => {
    e.preventDefault()
    gameRef.current?.setTouchButton(btn, true)
  }
  const release = (btn: ButtonName) => (e: React.PointerEvent) => {
    e.preventDefault()
    gameRef.current?.setTouchButton(btn, false)
  }

  const padBtn = (btn: ButtonName, label: string, style?: React.CSSProperties) => (
    <button
      style={{
        width: 58,
        height: 58,
        borderRadius: 14,
        border: '2px solid rgba(255,255,255,0.35)',
        background: 'rgba(255,255,255,0.12)',
        color: '#fff',
        fontSize: 20,
        fontWeight: 700,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ...style,
      }}
      onPointerDown={press(btn)}
      onPointerUp={release(btn)}
      onPointerLeave={release(btn)}
      onPointerCancel={release(btn)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  )

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0b0f1a',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        touchAction: 'none',
      }}
    >
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
        />
        <button
          aria-label="ミュート切り替え"
          onClick={() => {
            const m = gameRef.current?.toggleMute()
            setMuted(!!m)
          }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 40,
            height: 40,
            borderRadius: 10,
            border: 'none',
            background: 'rgba(255,255,255,0.15)',
            fontSize: 20,
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      {isTouch && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            padding: '10px 14px calc(14px + env(safe-area-inset-bottom))',
            background: '#111827',
            gap: 8,
          }}
        >
          {/* 左: 移動パッド */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 58px)',
              gridTemplateRows: 'repeat(2, 58px)',
              gap: 6,
            }}
          >
            <div />
            {padBtn('up', '▲')}
            <div />
            {padBtn('left', '◀')}
            {padBtn('down', '▼')}
            {padBtn('right', '▶')}
          </div>

          {/* 右: 攻撃ボタン */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 64px)',
              gridTemplateRows: 'repeat(2, 64px)',
              gap: 8,
            }}
          >
            {padBtn('punch', 'パンチ', { background: '#b91c1c', fontSize: 13, width: 64, height: 64, borderRadius: '50%' })}
            {padBtn('kick', 'キック', { background: '#1d4ed8', fontSize: 13, width: 64, height: 64, borderRadius: '50%' })}
            {padBtn('unique', '特殊', { background: '#15803d', fontSize: 14, width: 64, height: 64, borderRadius: '50%' })}
            {padBtn('special', '必殺', { background: '#c2410c', fontSize: 14, width: 64, height: 64, borderRadius: '50%' })}
          </div>
        </div>
      )}
    </div>
  )
}
