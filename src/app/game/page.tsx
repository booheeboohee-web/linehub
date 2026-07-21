import type { Metadata, Viewport } from 'next'
import GameClient from './GameClient'

export const metadata: Metadata = {
  title: 'ファミリーファイターズ 〜家族格闘伝説〜',
  description: '家族をキャラクターにした2D格闘ゲーム。PCでもスマホでも遊べます。',
  robots: { index: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0b0f1a',
}

export default function GamePage() {
  return <GameClient />
}
