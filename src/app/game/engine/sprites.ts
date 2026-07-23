// AI生成スプライトのロード管理。
// public/game-sprites/<charId>/{idle,punch,kick,special,hit,ko}.png が揃っているキャラは
// 画像スプライトで描画し、揃っていないキャラは従来のプログラム描画にフォールバックする。

export type SpritePose = 'idle' | 'punch' | 'kick' | 'special' | 'hit' | 'ko'

const SPRITE_POSES: SpritePose[] = ['idle', 'punch', 'kick', 'special', 'hit', 'ko']

interface Anchor {
  centerXFrac: number
  feetYFrac: number
}

export interface SpriteSet {
  images: Partial<Record<SpritePose, HTMLImageElement>>
  anchors: Partial<Record<SpritePose, Anchor>>
  /** idle画像内での本体の高さ(px)。全ポーズ共通の表示スケール基準。 */
  bodyPxHeight: number
}

const cache = new Map<string, SpriteSet | 'none' | 'loading'>()

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** 透過PNGの不透明部分の外接矩形を求める。 */
function detectBBox(img: HTMLImageElement): { x0: number; y0: number; x1: number; y1: number } | null {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  } catch {
    return null
  }
  const w = canvas.width
  const h = canvas.height
  let x0 = w,
    y0 = h,
    x1 = 0,
    y1 = 0
  const step = 2 // 高速化のため間引き
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const alpha = data.data[(y * w + x) * 4 + 3]
      if (alpha > 20) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) return null
  return { x0, y0, x1, y1 }
}

function anchorOf(img: HTMLImageElement): Anchor {
  const bbox = detectBBox(img)
  const w = img.naturalWidth || 1
  const h = img.naturalHeight || 1
  if (!bbox) return { centerXFrac: 0.5, feetYFrac: 1 }
  return { centerXFrac: (bbox.x0 + bbox.x1) / 2 / w, feetYFrac: bbox.y1 / h }
}

// スタンドアロン(Artifact)ビルド用: window.__SPRITE_ASSETS__ にdata URIを積んでおけば
// public/ 配信が無い環境でも同じロジックでスプライトを読み込める。
declare global {
  interface Window {
    __SPRITE_ASSETS__?: Partial<Record<string, Partial<Record<SpritePose, string>>>>
  }
}

function resolveSrc(charId: string, pose: SpritePose): string {
  const inline = typeof window !== 'undefined' ? window.__SPRITE_ASSETS__?.[charId]?.[pose] : undefined
  return inline ?? `/game-sprites/${charId}/${pose}.webp`
}

async function buildSpriteSet(charId: string): Promise<SpriteSet | 'none'> {
  const idleImg = await loadImage(resolveSrc(charId, 'idle'))
  if (!idleImg) return 'none'
  const images: SpriteSet['images'] = { idle: idleImg }
  await Promise.all(
    SPRITE_POSES.filter((p) => p !== 'idle').map(async (pose) => {
      const img = await loadImage(resolveSrc(charId, pose))
      if (img) images[pose] = img
    })
  )
  const anchors: SpriteSet['anchors'] = {}
  let bodyPxHeight = idleImg.naturalHeight || 512
  const idleBbox = detectBBox(idleImg)
  if (idleBbox) bodyPxHeight = idleBbox.y1 - idleBbox.y0
  for (const pose of SPRITE_POSES) {
    const img = images[pose]
    if (img) anchors[pose] = anchorOf(img)
  }
  return { images, anchors, bodyPxHeight }
}

/** 初回アクセス時に読み込みを開始する。まだ読み込み中/未着手ならnullを返す(呼び出し側は毎フレーム呼んでよい)。 */
export function getSprites(charId: string): SpriteSet | null {
  const cached = cache.get(charId)
  if (cached === 'none' || cached === 'loading' || cached === undefined) {
    if (cached === undefined) {
      cache.set(charId, 'loading')
      void buildSpriteSet(charId).then((result) => cache.set(charId, result))
    }
    return null
  }
  return cached
}

/** 指定ポーズの画像+アンカー。無ければidleにフォールバック。 */
export function pickSprite(set: SpriteSet, pose: SpritePose): { img: HTMLImageElement; anchor: Anchor } | null {
  const img = set.images[pose] ?? set.images.idle
  if (!img) return null
  const anchor = set.anchors[pose] ?? set.anchors.idle ?? { centerXFrac: 0.5, feetYFrac: 1 }
  return { img, anchor }
}
