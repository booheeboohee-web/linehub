// BGM音声ファイル(SUNOなどで作成した実際の楽曲)のパス解決。
// public/game-bgm/{title,select,battle}.mp3 を読み込む。
// スタンドアロンビルドでは window.__BGM_ASSETS__ にdata URIを積める。

export type BgmName = 'title' | 'select' | 'battle'

declare global {
  interface Window {
    __BGM_ASSETS__?: Partial<Record<BgmName, string>>
  }
}

export function resolveBgmSrc(name: BgmName): string {
  const inline = typeof window !== 'undefined' ? window.__BGM_ASSETS__?.[name] : undefined
  return inline ?? `/game-bgm/${name}.mp3`
}
