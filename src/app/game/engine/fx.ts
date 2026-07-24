// 飛び道具・エフェクトのAI生成画像ロード管理。
// public/game-fx/<name>.webp があればそれを使い、無ければ呼び出し側がプログラム描画にフォールバックする。
// スタンドアロンビルドでは window.__FX_ASSETS__ にdata URIを積める。

declare global {
  interface Window {
    __FX_ASSETS__?: Partial<Record<string, string>>
  }
}

const cache = new Map<string, HTMLImageElement | 'none' | 'loading'>()

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function resolveSrc(name: string): string {
  const inline = typeof window !== 'undefined' ? window.__FX_ASSETS__?.[name] : undefined
  return inline ?? `/game-fx/${name}.webp`
}

/** 未読み込みならロードを開始してnullを返す(呼び出し側は毎フレーム呼んでよい)。 */
export function getFxImage(name: string): HTMLImageElement | null {
  const cached = cache.get(name)
  if (cached === 'none' || cached === 'loading' || cached === undefined) {
    if (cached === undefined) {
      cache.set(name, 'loading')
      void loadImage(resolveSrc(name)).then((img) => cache.set(name, img ?? 'none'))
    }
    return null
  }
  return cached
}
