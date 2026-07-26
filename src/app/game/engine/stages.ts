// バトルステージ背景(実写)のロード管理。
// public/game-bg/house{1..N}.jpg を対戦開始時にランダムで1枚選ぶ。
// スタンドアロンビルドでは window.__STAGE_ASSETS__ にdata URIを積める。

export const STAGE_COUNT = 3

declare global {
  interface Window {
    __STAGE_ASSETS__?: string[]
    __TITLE_ASSET__?: string
    __SELECT_ASSET__?: string
  }
}

const cache = new Map<number, HTMLImageElement | 'none' | 'loading'>()
let titleCache: HTMLImageElement | 'none' | 'loading' | undefined
let selectCache: HTMLImageElement | 'none' | 'loading' | undefined

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
  return inline ?? `/game-bg/house${index + 1}.webp`
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

/** タイトル画面のキービジュアル。未読み込みならロードを開始してnullを返す。 */
export function getTitleImage(): HTMLImageElement | null {
  if (titleCache === 'none' || titleCache === 'loading' || titleCache === undefined) {
    if (titleCache === undefined) {
      titleCache = 'loading'
      const src = (typeof window !== 'undefined' ? window.__TITLE_ASSET__ : undefined) ?? '/game-bg/title.webp'
      void loadImage(src).then((img) => {
        titleCache = img ?? 'none'
      })
    }
    return null
  }
  return titleCache
}

/** キャラ選択画面の背景(実写)。未読み込みならロードを開始してnullを返す。 */
export function getSelectImage(): HTMLImageElement | null {
  if (selectCache === 'none' || selectCache === 'loading' || selectCache === undefined) {
    if (selectCache === undefined) {
      selectCache = 'loading'
      const src = (typeof window !== 'undefined' ? window.__SELECT_ASSET__ : undefined) ?? '/game-bg/select.webp'
      void loadImage(src).then((img) => {
        selectCache = img ?? 'none'
      })
    }
    return null
  }
  return selectCache
}
