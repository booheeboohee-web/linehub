// バトルステージ背景(実写)のロード管理。
// public/game-bg/house{1..N}.jpg を対戦開始時にランダムで1枚選ぶ。
// スタンドアロンビルドでは window.__STAGE_ASSETS__ にdata URIを積める。

export const STAGE_COUNT = 3

declare global {
  interface Window {
    __STAGE_ASSETS__?: string[]
  }
}

const cache = new Map<number, HTMLImageElement | 'none' | 'loading'>()

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function resolveSrc(index: number): string {
  const inline = typeof window !== 'undefined' ? window.__STAGE_ASSETS__?.[index] : undefined
  return inline ?? `/game-bg/house${index + 1}.jpg`
}

/** 未読み込みならロードを開始してnullを返す(呼び出し側は毎フレーム呼んでよい)。 */
export function getStageImage(index: number): HTMLImageElement | null {
  const cached = cache.get(index)
  if (cached === 'none' || cached === 'loading' || cached === undefined) {
    if (cached === undefined) {
      cache.set(index, 'loading')
      void loadImage(resolveSrc(index)).then((img) => cache.set(index, img ?? 'none'))
    }
    return null
  }
  return cached
}
