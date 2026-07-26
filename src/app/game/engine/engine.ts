// 家族格闘ゲーム エンジン本体
// 外部ライブラリ不使用。Canvas 2D + 固定タイムステップ(60fps)

import { CHARACTERS, CharDef, MoveDef, StatusKind, STATUS_INFO, ProjectileKind, ARCADE_QUEUE } from './characters'
import { getSprites, pickSprite, SpritePose } from './sprites'
import { getStageImage, getTitleImage, getSelectImage, STAGE_COUNT } from './stages'
import { getFxImage } from './fx'

/** 画像の縦横比を保ったまま中心基準で描画する。 */
function drawFxImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, targetW: number) {
  const scale = targetW / img.naturalWidth
  const w = img.naturalWidth * scale
  const h = img.naturalHeight * scale
  ctx.drawImage(img, -w / 2, -h / 2, w, h)
}

const POSE_TO_SPRITE: Record<Pose, SpritePose> = {
  idle: 'idle',
  walk: 'idle',
  jump: 'idle',
  guard: 'idle',
  punch: 'punch',
  kick: 'kick',
  special: 'special',
  hit: 'hit',
  ko: 'ko',
}
import { AudioMan } from './audio'

export const VIEW_W = 960
export const VIEW_H = 540
const GROUND = 482
const GRAVITY = 0.55
const ROUND_TIME = 99
const ROUNDS_TO_WIN = 2

export type ButtonName = 'left' | 'right' | 'up' | 'down' | 'punch' | 'kick' | 'unique' | 'special'

interface InputState {
  left: boolean
  right: boolean
  up: boolean
  down: boolean
  punch: boolean
  kick: boolean
  unique: boolean
  special: boolean
}

const emptyInput = (): InputState => ({
  left: false, right: false, up: false, down: false,
  punch: false, kick: false, unique: false, special: false,
})

class Input {
  cur = emptyInput()
  prev = emptyInput()
  press = emptyInput()
  private queued: Partial<InputState> = {}

  /** フレーム間で押して離された入力も取りこぼさないようキューに積む */
  queue(btn: ButtonName) {
    this.queued[btn] = true
  }

  beginFrame() {
    const keys = Object.keys(this.cur) as ButtonName[]
    for (const k of keys) this.press[k] = (this.cur[k] && !this.prev[k]) || !!this.queued[k]
    this.prev = { ...this.cur }
    this.queued = {}
  }

  anyPress() {
    return Object.values(this.press).some(Boolean)
  }
}

type Pose = 'idle' | 'walk' | 'jump' | 'punch' | 'kick' | 'special' | 'hit' | 'ko' | 'guard'

type FighterState = 'idle' | 'walk' | 'jump' | 'attack' | 'hitstun' | 'ko'

interface Dot {
  dps: number
  t: number
  kind: StatusKind
}

interface Projectile {
  kind: ProjectileKind
  x: number
  y: number
  vx: number
  w: number
  h: number
  damage: number
  kb: number
  launch: number
  owner: number
  pierce: boolean
  status?: { kind: StatusKind; dur: number }
  dot?: { dps: number; dur: number; kind: StatusKind }
  moveName: string
  life: number
  hitIds: Set<number>
  seed: number
}

interface Barrier {
  x: number
  y: number
  w: number
  h: number
  t: number
  owner: number
  damage: number
  kb: number
  cd: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  t: number
  max: number
  color: string
  size: number
}

interface DamageNum {
  x: number
  y: number
  val: number
  t: number
  color: string
}

interface Banner {
  text: string
  sub?: string
  t: number
  max: number
  color: string
}

interface PendingShots {
  move: MoveDef
  count: number
  interval: number
  t: number
}

class Fighter {
  def: CharDef
  idx: number
  x = 0
  y = GROUND
  vx = 0
  vy = 0
  facing: 1 | -1 = 1
  hp: number
  meter = 0
  state: FighterState = 'idle'
  move: MoveDef | null = null
  moveT = 0
  hitCount = 0
  lastHitT = -999
  grabDone = false
  hitstunT = 0
  koT = 0
  animT = 0
  uniqueCd = 0
  statuses: Partial<Record<StatusKind, number>> = {}
  dots: Dot[] = []
  pending: PendingShots | null = null

  constructor(def: CharDef, idx: number) {
    this.def = def
    this.idx = idx
    this.hp = def.hp
  }

  get hPx() {
    // キャラの顔がはっきり見える大きさにするため、実寸(0.78)よりかなり大きめに表示する
    return this.def.heightCm * 2.0
  }

  get wPx() {
    return this.hPx * 0.34 * this.def.widthScale
  }

  get grounded() {
    return this.y >= GROUND - 0.1
  }

  has(kind: StatusKind) {
    return (this.statuses[kind] ?? 0) > 0
  }

  addStatus(kind: StatusKind, durSec: number) {
    this.statuses[kind] = Math.max(this.statuses[kind] ?? 0, durSec * 60)
  }

  clearForRound(x: number, facing: 1 | -1) {
    this.x = x
    this.y = GROUND
    this.vx = 0
    this.vy = 0
    this.facing = facing
    this.hp = this.def.hp
    this.state = 'idle'
    this.move = null
    this.hitstunT = 0
    this.koT = 0
    this.uniqueCd = 0
    this.statuses = {}
    this.dots = []
    this.pending = null
  }

  hurtbox() {
    const w = this.wPx
    const h = this.state === 'ko' ? this.hPx * 0.3 : this.hPx
    return { x: this.x - w / 2, y: this.y - h, w, h }
  }
}

type Screen = 'title' | 'mode' | 'select' | 'battle' | 'result'
type BattlePhase = 'intro' | 'fight' | 'roundEnd'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

export class Game {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private raf = 0
  private last = 0
  private acc = 0
  audio = new AudioMan()

  private screen: Screen = 'title'
  private frame = 0

  private inputs: [Input, Input] = [new Input(), new Input()]
  private vsCpu = true

  // メニュー系
  private modeCursor = 0
  private selCursor: [number, number] = [0, 4]
  private picker = 0 // 0=1P選択中, 1=2P/CPU選択中
  private picked: [number, number] = [-1, -1]
  private resultCursor = 0
  private tapRects: { rect: Rect; act: () => void }[] = []
  private isArcade = false
  private arcadeIndex = 0
  private stageIndex = 0

  // バトル系
  private fighters: [Fighter, Fighter] | null = null
  private phase: BattlePhase = 'intro'
  private phaseT = 0
  private timer = ROUND_TIME * 60
  private roundNo = 1
  private roundsToWin = ROUNDS_TO_WIN
  private wins: [number, number] = [0, 0]
  private projectiles: Projectile[] = []
  private barriers: Barrier[] = []
  private particles: Particle[] = []
  private dmgNums: DamageNum[] = []
  private banners: Banner[] = []
  private shake = 0
  private roundWinner = -1
  private matchWinner = -1
  private aiActT = 0
  private aiAct: Partial<InputState> = {}

  private keydown = (e: KeyboardEvent) => this.onKey(e, true)
  private keyup = (e: KeyboardEvent) => this.onKey(e, false)
  private pointerdown = (e: PointerEvent) => this.onTap(e)

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    this.ctx = ctx
    window.addEventListener('keydown', this.keydown)
    window.addEventListener('keyup', this.keyup)
    canvas.addEventListener('pointerdown', this.pointerdown)
    this.raf = requestAnimationFrame(this.loop)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('keydown', this.keydown)
    window.removeEventListener('keyup', this.keyup)
    this.canvas.removeEventListener('pointerdown', this.pointerdown)
    this.audio.destroy()
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted
    return this.audio.muted
  }

  /** 現在の画面名(デバッグ・テスト用) */
  get screenName() {
    return this.screen
  }

  /** タッチUI(1P)からのボタン入力 */
  setTouchButton(btn: ButtonName, down: boolean) {
    this.audio.unlock()
    this.inputs[0].cur[btn] = down
    if (down) this.inputs[0].queue(btn)
  }

  // ---------- 入力 ----------

  private onKey(e: KeyboardEvent, down: boolean) {
    const map: Record<string, [number, ButtonName]> = {
      KeyA: [0, 'left'], KeyD: [0, 'right'], KeyW: [0, 'up'], KeyS: [0, 'down'],
      KeyF: [0, 'punch'], KeyG: [0, 'kick'], KeyH: [0, 'unique'], Space: [0, 'special'],
      ArrowLeft: [1, 'left'], ArrowRight: [1, 'right'], ArrowUp: [1, 'up'], ArrowDown: [1, 'down'],
      KeyJ: [1, 'punch'], KeyK: [1, 'kick'], KeyL: [1, 'unique'], Enter: [1, 'special'],
    }
    const hit = map[e.code]
    if (hit) {
      e.preventDefault()
      this.inputs[hit[0]].cur[hit[1]] = down
      if (down && !e.repeat) {
        this.inputs[hit[0]].queue(hit[1])
        this.audio.unlock()
      }
    }
    if (down && e.code === 'KeyM') this.toggleMute()
  }

  private canvasPos(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect()
    const scale = Math.min(r.width / VIEW_W, r.height / VIEW_H)
    const ox = (r.width - VIEW_W * scale) / 2
    const oy = (r.height - VIEW_H * scale) / 2
    return {
      x: (e.clientX - r.left - ox) / scale,
      y: (e.clientY - r.top - oy) / scale,
    }
  }

  private onTap(e: PointerEvent) {
    this.audio.unlock()
    const p = this.canvasPos(e)
    if (this.screen === 'title') {
      this.gotoMode()
      return
    }
    for (const t of this.tapRects) {
      if (p.x >= t.rect.x && p.x <= t.rect.x + t.rect.w && p.y >= t.rect.y && p.y <= t.rect.y + t.rect.h) {
        t.act()
        return
      }
    }
  }

  // ---------- 画面遷移 ----------

  private gotoMode() {
    this.screen = 'mode'
    this.modeCursor = 0
    this.audio.sfx('confirm')
    this.audio.startBgm('title')
  }

  private gotoSelect() {
    this.screen = 'select'
    this.picker = 0
    this.picked = [-1, -1]
    this.selCursor = [0, 4]
    if (this.isArcade) this.arcadeIndex = 0
    this.audio.sfx('confirm')
    this.audio.startBgm('select')
  }

  private startMatch() {
    const d0 = CHARACTERS[this.picked[0]]
    const d1 = this.isArcade ? ARCADE_QUEUE[this.arcadeIndex] : CHARACTERS[this.picked[1]]
    this.fighters = [new Fighter(d0, 0), new Fighter(d1, 1)]
    this.wins = [0, 0]
    this.roundNo = 1
    this.matchWinner = -1
    this.roundsToWin = this.isArcade ? 1 : ROUNDS_TO_WIN
    this.stageIndex = Math.floor(Math.random() * STAGE_COUNT)
    this.startRound()
    this.screen = 'battle'
    this.audio.sfx('super')
    this.audio.startBgm('battle')
  }

  private startRound() {
    if (!this.fighters) return
    this.fighters[0].clearForRound(VIEW_W * 0.27, 1)
    this.fighters[1].clearForRound(VIEW_W * 0.73, -1)
    this.projectiles = []
    this.barriers = []
    this.particles = []
    this.dmgNums = []
    this.banners = []
    this.timer = ROUND_TIME * 60
    this.phase = 'intro'
    this.phaseT = 0
    this.roundWinner = -1
    this.shake = 0
  }

  private gotoResult() {
    this.screen = 'result'
    this.resultCursor = 0
  }

  private gotoTitle() {
    this.screen = 'title'
    this.isArcade = false
    this.audio.startBgm('title')
  }

  // ---------- メインループ ----------

  private loop = (t: number) => {
    this.raf = requestAnimationFrame(this.loop)
    if (this.last === 0) this.last = t
    this.acc += Math.min(100, t - this.last)
    this.last = t
    const step = 1000 / 60
    let n = 0
    while (this.acc >= step && n < 4) {
      this.update()
      this.acc -= step
      n++
    }
    this.render()
  }

  private update() {
    this.frame++
    this.inputs[0].beginFrame()
    this.inputs[1].beginFrame()
    switch (this.screen) {
      case 'title':
        if (this.inputs[0].anyPress() || this.inputs[1].anyPress()) this.gotoMode()
        break
      case 'mode':
        this.updateMode()
        break
      case 'select':
        this.updateSelect()
        break
      case 'battle':
        this.updateBattle()
        break
      case 'result':
        this.updateResult()
        break
    }
  }

  // ---------- モード選択 ----------

  private updateMode() {
    const [i1, i2] = this.inputs
    if (i1.press.up || i2.press.up) {
      this.modeCursor = (this.modeCursor + 2) % 3
      this.audio.sfx('select')
    }
    if (i1.press.down || i2.press.down) {
      this.modeCursor = (this.modeCursor + 1) % 3
      this.audio.sfx('select')
    }
    if (i1.press.punch || i1.press.special || i2.press.punch || i2.press.special) {
      this.selectMode(this.modeCursor)
    }
  }

  private selectMode(idx: number) {
    this.modeCursor = idx
    this.isArcade = idx === 2
    this.vsCpu = idx !== 1
    this.gotoSelect()
  }

  // ---------- キャラ選択 ----------

  private updateSelect() {
    const input = this.picker === 0 || this.vsCpu ? null : this.inputs[1]
    const active = this.picker === 0 ? this.inputs[0] : (input ?? this.inputs[0])
    const c = this.selCursor
    const cur = c[this.picker]
    let next = cur
    if (active.press.left) next = cur % 3 === 0 ? cur + 2 : cur - 1
    if (active.press.right) next = cur % 3 === 2 ? cur - 2 : cur + 1
    if (active.press.up) next = (cur + 6) % 9
    if (active.press.down) next = (cur + 3) % 9
    if (next !== cur) {
      c[this.picker] = next
      this.audio.sfx('select')
    }
    if (active.press.kick && this.picker === 1) {
      this.picker = 0
      this.picked[0] = -1
      this.audio.sfx('error')
      return
    }
    if (active.press.punch || active.press.special) {
      this.confirmSelect(c[this.picker])
    }
  }

  private confirmSelect(idx: number) {
    this.picked[this.picker] = idx
    this.audio.sfx('confirm')
    if (this.picker === 0 && this.isArcade) {
      this.arcadeIndex = 0
      this.startMatch()
      return
    }
    if (this.picker === 0) {
      this.picker = 1
      if (this.selCursor[1] === this.selCursor[0]) this.selCursor[1] = (idx + 1) % 9
    } else {
      this.startMatch()
    }
  }

  // ---------- リザルト ----------

  private updateResult() {
    const [i1, i2] = this.inputs
    let d = 0
    if (i1.press.up || i2.press.up) d = -1
    if (i1.press.down || i2.press.down) d = 1
    if (d !== 0) {
      this.resultCursor = (this.resultCursor + d + 3) % 3
      this.audio.sfx('select')
    }
    if (i1.press.punch || i1.press.special || i2.press.punch || i2.press.special) {
      this.audio.sfx('confirm')
      if (this.resultCursor === 0) this.startMatch()
      else if (this.resultCursor === 1) this.gotoSelect()
      else this.gotoTitle()
    }
  }

  // ---------- バトル進行 ----------

  private updateBattle() {
    if (!this.fighters) return
    const [f1, f2] = this.fighters
    this.phaseT++
    if (this.shake > 0) this.shake *= 0.85

    if (this.phase === 'intro') {
      if (this.phaseT > 110) {
        this.phase = 'fight'
        this.phaseT = 0
      }
      return
    }

    if (this.phase === 'roundEnd') {
      // KO演出中も物理だけ動かす
      for (const f of this.fighters) this.physicsOnly(f)
      if (this.phaseT > 150) {
        if (this.roundWinner >= 0) this.wins[this.roundWinner]++
        if (this.roundWinner >= 0 && this.wins[this.roundWinner] >= this.roundsToWin) {
          this.matchWinner = this.roundWinner
          if (this.isArcade && this.matchWinner === 0 && this.arcadeIndex < ARCADE_QUEUE.length - 1) {
            this.arcadeIndex++
            this.startMatch()
          } else {
            this.gotoResult()
          }
        } else {
          this.roundNo++
          this.startRound()
        }
      }
      return
    }

    // fight中
    this.timer--
    if (this.vsCpu) this.cpuThink(f2, f1)

    this.stepFighter(f1, f2, this.inputs[0])
    this.stepFighter(f2, f1, this.vsCpu ? this.aiInput() : this.inputs[1])

    // 体の押し合い
    const dist = Math.abs(f1.x - f2.x)
    const minDist = (f1.wPx + f2.wPx) / 2 - 6
    if (dist < minDist && f1.state !== 'ko' && f2.state !== 'ko') {
      const push = (minDist - dist) / 2
      const dir = f1.x <= f2.x ? -1 : 1
      f1.x += push * dir
      f2.x -= push * dir
      this.clampX(f1)
      this.clampX(f2)
    }

    this.updateProjectiles()
    this.updateBarriers()
    this.updateFx()

    // 決着判定
    if (f1.hp <= 0 || f2.hp <= 0) {
      this.endRound(f1.hp <= 0 && f2.hp <= 0 ? -1 : f1.hp <= 0 ? 1 : 0, true)
    } else if (this.timer <= 0) {
      this.endRound(f1.hp === f2.hp ? -1 : f1.hp > f2.hp ? 0 : 1, false)
    }
  }

  private endRound(winner: number, ko: boolean) {
    if (!this.fighters) return
    this.phase = 'roundEnd'
    this.phaseT = 0
    this.roundWinner = winner
    if (ko) {
      const losers =
        winner === -1
          ? [this.fighters[0], this.fighters[1]]
          : [this.fighters[winner === 0 ? 1 : 0]]
      for (const loser of losers) {
        loser.state = 'ko'
        loser.move = null
        loser.vy = -7
        loser.vx = -loser.facing * 5
      }
      this.audio.sfx('ko')
      this.banners.push({ text: 'K.O.', t: 0, max: 120, color: '#ff3b30' })
      this.shake = 18
    } else {
      this.banners.push({ text: 'TIME UP', t: 0, max: 120, color: '#ffd60a' })
    }
  }

  private clampX(f: Fighter) {
    const half = f.wPx / 2
    f.x = Math.max(half + 8, Math.min(VIEW_W - half - 8, f.x))
  }

  private physicsOnly(f: Fighter) {
    f.x += f.vx
    f.y += f.vy
    if (f.y < GROUND) f.vy += GRAVITY
    if (f.y >= GROUND) {
      f.y = GROUND
      f.vy = 0
      f.vx *= 0.8
    }
    this.clampX(f)
  }

  // ---------- ファイター更新 ----------

  private stepFighter(f: Fighter, foe: Fighter, input: Input) {
    f.animT++
    if (f.uniqueCd > 0) f.uniqueCd--

    // 状態異常タイマー
    for (const k of Object.keys(f.statuses) as StatusKind[]) {
      const v = f.statuses[k]
      if (v !== undefined && v > 0) f.statuses[k] = v - 1
    }
    // 継続ダメージ
    f.dots = f.dots.filter((d) => {
      d.t--
      f.hp = Math.max(0, f.hp - d.dps / 60)
      return d.t > 0
    })

    if (f.state === 'ko') {
      this.physicsOnly(f)
      return
    }

    if (f.state === 'hitstun') {
      f.hitstunT--
      this.physicsOnly(f)
      if (f.hitstunT <= 0 && f.grounded) f.state = 'idle'
      return
    }

    // 向き(攻撃中以外)
    if (f.state !== 'attack' && f.grounded) {
      f.facing = f.x <= foe.x ? 1 : -1
    }

    if (f.state === 'attack' && f.move) {
      this.stepAttack(f, foe)
      // 突進の慣性・重力
      f.x += f.vx
      f.y += f.vy
      if (f.y < GROUND) f.vy += GRAVITY
      else {
        f.y = GROUND
        f.vy = 0
      }
      this.clampX(f)
      return
    }

    // 行動不能ステータス
    const disabled = f.has('stun') || f.has('bind')
    const rooted = f.has('root')
    const charmed = f.has('charm')
    const confused = f.has('confuse')

    let left = input.cur.left
    let right = input.cur.right
    if (confused) {
      const tmp = left
      left = right
      right = tmp
    }

    f.vx = 0
    if (!disabled) {
      if (!rooted) {
        if (left) f.vx = -f.def.speed
        if (right) f.vx = f.def.speed
        if (input.press.up && f.grounded) {
          f.vy = -f.def.jumpV
          f.y -= 1
          this.audio.sfx('jump')
        }
      }
      // 攻撃
      if (!charmed && f.grounded) {
        if (input.press.special) this.trySpecial(f)
        else if (input.press.unique && f.uniqueCd <= 0) this.startMove(f, f.def.unique)
        else if (input.press.punch) {
          const grabRange = (f.wPx + foe.wPx) / 2 + 18
          if (Math.abs(f.x - foe.x) < grabRange && foe.grounded && foe.state !== 'ko') {
            this.startMove(f, f.def.grab)
          } else {
            this.startMove(f, f.def.punch)
          }
        } else if (input.press.kick) this.startMove(f, f.def.kick)
      }
      // このフレームで攻撃を開始した場合、下の state 上書きを避ける
      if (f.state === 'attack') return
    }

    f.x += f.vx
    f.y += f.vy
    if (f.y < GROUND) {
      f.vy += GRAVITY
      f.state = 'jump'
    } else {
      f.y = GROUND
      f.vy = 0
      if (f.state === 'jump') f.state = 'idle'
      f.state = f.vx !== 0 ? 'walk' : 'idle'
    }
    this.clampX(f)
  }

  private isGuarding(f: Fighter, foe: Fighter, input: Input) {
    if (!f.grounded || f.state === 'attack' || f.state === 'hitstun' || f.state === 'ko') return false
    if (f.has('stun') || f.has('bind') || f.has('confuse')) return false
    const away = foe.x > f.x ? input.cur.left : input.cur.right
    return away
  }

  private trySpecial(f: Fighter) {
    if (f.meter >= 100) {
      f.meter = 0
      this.startMove(f, f.def.sp2)
      this.audio.sfx('super')
    } else if (f.meter >= 50) {
      f.meter -= 50
      this.startMove(f, f.def.sp1)
      this.audio.sfx('special')
    } else {
      this.audio.sfx('error')
      this.dmgNums.push({ x: f.x, y: f.y - f.hPx - 20, val: -1, t: 0, color: '#94a3b8' })
    }
  }

  private startMove(f: Fighter, move: MoveDef) {
    f.state = 'attack'
    f.move = move
    f.moveT = 0
    f.hitCount = 0
    f.lastHitT = -999
    f.grabDone = false
    f.vx = 0
    if (move.banner) {
      this.banners.push({ text: move.name, sub: f.def.name, t: 0, max: 80, color: f.def.accent })
    }
    if (move === f.def.unique) {
      f.uniqueCd = 80
    }
  }

  private stepAttack(f: Fighter, foe: Fighter) {
    const m = f.move
    if (!m) return
    f.moveT++
    const activeStart = m.startup
    const activeEnd = m.startup + m.active
    const total = activeEnd + m.recovery
    const inActive = f.moveT > activeStart && f.moveT <= activeEnd

    // 突進
    if (m.lunge && f.moveT === activeStart + 1) {
      f.vx = m.lunge.vx * f.facing
      if (m.lunge.vy) f.vy = m.lunge.vy
    }
    if (!m.lunge) f.vx = 0
    if (m.lunge && f.moveT > activeEnd) f.vx *= 0.85

    if (inActive) {
      switch (m.type) {
        case 'strike':
          this.checkStrike(f, foe, m)
          break
        case 'grab':
          this.checkGrab(f, foe, m)
          break
        case 'aura':
        case 'taunt':
          if (f.hitCount === 0) {
            f.hitCount = 1
            this.doAura(f, foe, m)
          }
          break
        case 'projectile':
          if (f.hitCount === 0) {
            f.hitCount = 1
            this.fireProjectile(f, m)
          }
          break
        case 'barrier':
          if (f.hitCount === 0) {
            f.hitCount = 1
            this.barriers.push({
              x: f.x + f.facing * (f.wPx / 2 + m.range / 2),
              y: GROUND,
              w: m.range,
              h: f.hPx * 1.05,
              t: m.active,
              owner: f.idx,
              damage: m.damage,
              kb: m.kb,
              cd: 0,
            })
          }
          break
      }
    }

    if (f.moveT >= total) {
      f.move = null
      f.state = 'idle'
    }
  }

  private checkStrike(f: Fighter, foe: Fighter, m: MoveDef) {
    const maxHits = m.hits ?? 1
    if (f.hitCount >= maxHits) return
    if (f.moveT - f.lastHitT < (m.hitInterval ?? 999) && f.hitCount > 0) return
    const hbH = m.hbH ?? f.hPx * 0.6
    const hb: Rect = {
      x: f.facing === 1 ? f.x : f.x - f.wPx / 2 - m.range,
      y: f.y - f.hPx * 0.85,
      w: f.wPx / 2 + m.range,
      h: hbH,
    }
    if (f.facing === 1) hb.x = f.x
    if (overlap(hb, foe.hurtbox())) {
      f.hitCount++
      f.lastHitT = f.moveT
      this.applyHit(f, foe, m, false)
    }
  }

  private checkGrab(f: Fighter, foe: Fighter, m: MoveDef) {
    if (f.grabDone) return
    const dist = Math.abs(f.x - foe.x)
    const inFront = (foe.x - f.x) * f.facing > 0
    if (dist < (f.wPx + foe.wPx) / 2 + m.range && inFront && foe.state !== 'ko' && foe.grounded) {
      f.grabDone = true
      this.applyHit(f, foe, m, true)
    }
  }

  private doAura(f: Fighter, foe: Fighter, m: MoveDef) {
    if (m.type === 'taunt') f.meter = Math.min(100, f.meter + 15)
    if (Math.abs(f.x - foe.x) <= m.range && foe.state !== 'ko') {
      this.applyHit(f, foe, m, true)
    }
    // 演出パーティクル
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 * i) / 14
      this.particles.push({
        x: f.x, y: f.y - f.hPx / 2,
        vx: Math.cos(a) * 4, vy: Math.sin(a) * 4,
        t: 0, max: 30, color: f.def.accent, size: 5,
      })
    }
  }

  private fireProjectile(f: Fighter, m: MoveDef) {
    const p = m.projectile
    if (!p) return
    const count = p.count ?? 1
    if (count > 1) {
      f.pending = { move: m, count: count - 1, interval: p.interval ?? 6, t: p.interval ?? 6 }
    }
    this.spawnProjectile(f, m)
    this.audio.sfx('special')
  }

  private spawnProjectile(f: Fighter, m: MoveDef) {
    const p = m.projectile
    if (!p) return
    const spread = p.spread ? (Math.random() - 0.5) * p.spread : 0
    this.projectiles.push({
      kind: p.kind,
      x: f.x + f.facing * (f.wPx / 2 + 10),
      y: GROUND - p.yOff + spread,
      vx: p.speed * f.facing,
      w: p.w,
      h: p.h,
      damage: m.damage,
      kb: m.kb,
      launch: m.launch ?? 0,
      owner: f.idx,
      pierce: p.pierce ?? false,
      status: m.status,
      dot: m.dot,
      moveName: m.name,
      life: 240,
      hitIds: new Set(),
      seed: Math.random() * 1000,
    })
  }

  private updateProjectiles() {
    if (!this.fighters) return
    const fs = this.fighters
    // 連射キュー
    for (const f of fs) {
      if (f.pending) {
        f.pending.t--
        if (f.pending.t <= 0) {
          this.spawnProjectile(f, f.pending.move)
          f.pending.count--
          f.pending.t = f.pending.interval
          if (f.pending.count <= 0) f.pending = null
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => {
      p.x += p.vx
      p.life--
      const foe = fs[p.owner === 0 ? 1 : 0]
      if (!p.hitIds.has(foe.idx) && foe.state !== 'ko') {
        const box: Rect = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h }
        if (overlap(box, foe.hurtbox())) {
          p.hitIds.add(foe.idx)
          const fake: MoveDef = {
            name: p.moveName, type: 'strike', damage: p.damage,
            startup: 0, active: 0, recovery: 0, range: 0,
            kb: p.kb, launch: p.launch, status: p.status, dot: p.dot,
          }
          this.applyHit(fs[p.owner], foe, fake, false)
          if (!p.pierce) return false
        }
      }
      return p.life > 0 && p.x > -220 && p.x < VIEW_W + 220
    })
  }

  private updateBarriers() {
    if (!this.fighters) return
    const fs = this.fighters
    this.barriers = this.barriers.filter((b) => {
      b.t--
      if (b.cd > 0) b.cd--
      const foe = fs[b.owner === 0 ? 1 : 0]
      const box: Rect = { x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h }
      if (b.cd <= 0 && foe.state !== 'ko' && overlap(box, foe.hurtbox())) {
        b.cd = 40
        const fake: MoveDef = {
          name: '洗濯物アタック', type: 'strike', damage: b.damage,
          startup: 0, active: 0, recovery: 0, range: 0, kb: b.kb, launch: 5,
        }
        this.applyHit(fs[b.owner], foe, fake, false)
      }
      return b.t > 0
    })
  }

  private updateFx() {
    this.particles = this.particles.filter((p) => {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.2
      p.t++
      return p.t < p.max
    })
    this.dmgNums = this.dmgNums.filter((d) => {
      d.t++
      d.y -= 0.8
      return d.t < 50
    })
    this.banners = this.banners.filter((b) => {
      b.t++
      return b.t < b.max
    })
  }

  private applyHit(att: Fighter, def_: Fighter, m: MoveDef, ignoreGuard: boolean) {
    const input = this.inputs[def_.idx]
    const guarding =
      !ignoreGuard &&
      this.isGuarding(def_, att, this.vsCpu && def_.idx === 1 ? this.aiInputRef() : input)

    let dmg = m.damage
    if (att.has('atkDown')) dmg *= 0.55
    if (def_.has('defDown')) dmg *= 1.45
    if (guarding) dmg *= 0.15
    dmg = Math.round(dmg)

    def_.hp = Math.max(0, def_.hp - dmg)
    att.meter = Math.min(100, att.meter + dmg * 0.08 + 3)
    def_.meter = Math.min(100, def_.meter + dmg * 0.12)

    const dir = def_.x >= att.x ? 1 : -1
    if (guarding) {
      def_.vx = dir * m.kb * 0.4
      this.audio.sfx('guard')
      this.dmgNums.push({ x: def_.x, y: def_.y - def_.hPx - 14, val: dmg, t: 0, color: '#7dd3fc' })
    } else {
      def_.state = 'hitstun'
      def_.move = null
      def_.hitstunT = Math.round(13 + dmg * 0.1)
      def_.vx = dir * m.kb
      if (m.launch) {
        def_.vy = -m.launch
        def_.y -= 2
      }
      this.audio.sfx(dmg >= 100 ? 'super' : dmg >= 45 ? 'kick' : 'hit')
      this.dmgNums.push({
        x: def_.x, y: def_.y - def_.hPx - 14, val: dmg, t: 0,
        color: dmg >= 100 ? '#ff453a' : '#ffd60a',
      })
      if (m.status) {
        def_.addStatus(m.status.kind, m.status.dur)
        this.audio.sfx('status')
        this.banners.push({
          text: STATUS_INFO[m.status.kind].label + '!',
          t: 0, max: 60, color: '#c084fc',
        })
      }
      if (m.dot) {
        def_.dots.push({ dps: m.dot.dps, t: m.dot.dur * 60, kind: m.dot.kind })
        def_.addStatus(m.dot.kind, m.dot.dur)
      }
      // ヒットスパーク
      for (let i = 0; i < 8; i++) {
        this.particles.push({
          x: def_.x + dir * -def_.wPx * 0.3,
          y: def_.y - def_.hPx * 0.6,
          vx: (Math.random() - 0.3) * 6 * dir,
          vy: (Math.random() - 0.6) * 6,
          t: 0, max: 22,
          color: i % 2 ? '#ffd60a' : '#ff9f0a',
          size: 4,
        })
      }
    }
    if (m.shake) this.shake = Math.max(this.shake, m.shake)
  }

  // ---------- CPU AI ----------

  private aiInputObj = new Input()

  private aiInput(): Input {
    return this.aiInputObj
  }

  private aiInputRef(): Input {
    return this.aiInputObj
  }

  private cpuThink(me: Fighter, foe: Fighter) {
    const inp = this.aiInputObj
    const cur = emptyInput()
    this.aiActT--
    if (this.aiActT <= 0) {
      // 新しい行動を決定
      const dist = Math.abs(me.x - foe.x)
      const aggro = me.def.isBoss || me.def.isMidBoss ? 0.3 : me.def.species === 'cat' ? 0.12 : 0
      const r = Math.random() * (1 - aggro)
      const act: Partial<InputState> = {}
      const toward = foe.x > me.x ? 'right' : 'left'
      const away = foe.x > me.x ? 'left' : 'right'
      if (me.meter >= 100 && dist < 260 && r < 0.35) {
        act.special = true
        this.aiActT = 30
      } else if (me.meter >= 50 && dist < 200 && r < 0.25) {
        act.special = true
        this.aiActT = 30
      } else if (dist > 320) {
        if (r < 0.25 && me.uniqueCd <= 0) {
          act.unique = true
          this.aiActT = 25
        } else if (r < 0.85) {
          act[toward] = true
          this.aiActT = 22
        } else {
          act.up = true
          act[toward] = true
          this.aiActT = 30
        }
      } else if (dist > 95) {
        if (r < 0.6) {
          act[toward] = true
          this.aiActT = 14
        } else if (r < 0.72 && me.uniqueCd <= 0) {
          act.unique = true
          this.aiActT = 25
        } else if (r < 0.84) {
          act[away] = true
          this.aiActT = 14
        } else {
          act.up = true
          act[toward] = true
          this.aiActT = 28
        }
      } else {
        if (r < 0.34) {
          act.punch = true
          this.aiActT = 20
        } else if (r < 0.62) {
          act.kick = true
          this.aiActT = 24
        } else if (r < 0.78) {
          act[away] = true // ガード気味に下がる
          this.aiActT = 20
        } else if (r < 0.88 && me.uniqueCd <= 0) {
          act.unique = true
          this.aiActT = 26
        } else {
          act[toward] = true
          this.aiActT = 10
        }
      }
      this.aiAct = act
    }
    Object.assign(cur, this.aiAct)
    // 押しっぱなし防止: 単発ボタンは1フレームだけ
    if (this.aiActT < 28) {
      this.aiAct.punch = false
      this.aiAct.kick = false
      this.aiAct.unique = false
      this.aiAct.special = false
      this.aiAct.up = false
    }
    inp.cur = cur as InputState
    inp.beginFrame()
  }

  // ---------- 描画 ----------

  private render() {
    const ctx = this.ctx
    const dpr = window.devicePixelRatio || 1
    const cw = this.canvas.clientWidth
    const ch = this.canvas.clientHeight
    if (cw === 0 || ch === 0) return
    const bw = Math.round(cw * dpr)
    const bh = Math.round(ch * dpr)
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw
      this.canvas.height = bh
    }
    const scale = Math.min(cw / VIEW_W, ch / VIEW_H) * dpr
    const ox = (bw - VIEW_W * scale) / 2
    const oy = (bh - VIEW_H * scale) / 2
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#0b0f1a'
    ctx.fillRect(0, 0, bw, bh)
    ctx.setTransform(scale, 0, 0, scale, ox, oy)
    ctx.imageSmoothingEnabled = false

    this.tapRects = []

    switch (this.screen) {
      case 'title':
        this.renderTitle(ctx)
        break
      case 'mode':
        this.renderMode(ctx)
        break
      case 'select':
        this.renderSelect(ctx)
        break
      case 'battle':
        this.renderBattle(ctx)
        break
      case 'result':
        this.renderResult(ctx)
        break
    }
  }

  private font(size: number, bold = true) {
    return `${bold ? 'bold ' : ''}${size}px "Noto Sans JP", "Hiragino Sans", sans-serif`
  }

  /** 日本語文字単位で折り返す(ctx.fontは呼び出し側で設定済みのものを使う)。 */
  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const lines: string[] = []
    let cur = ''
    for (const ch of text) {
      const test = cur + ch
      if (cur && ctx.measureText(test).width > maxWidth) {
        lines.push(cur)
        cur = ch
      } else {
        cur = test
      }
    }
    if (cur) lines.push(cur)
    return lines
  }

  private renderBg(ctx: CanvasRenderingContext2D) {
    // 夕方の住宅街ステージ
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND)
    sky.addColorStop(0, '#2b1e4e')
    sky.addColorStop(0.6, '#7a3b6e')
    sky.addColorStop(1, '#e8845a')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, VIEW_W, GROUND)
    // 太陽
    ctx.fillStyle = '#ffd166'
    ctx.beginPath()
    ctx.arc(VIEW_W / 2, GROUND - 40, 60, Math.PI, 0)
    ctx.fill()
    // 遠景の家
    ctx.fillStyle = '#1d1633'
    for (let i = 0; i < 6; i++) {
      const hx = 40 + i * 170
      const hh = 70 + ((i * 37) % 50)
      ctx.fillRect(hx, GROUND - hh, 110, hh)
      ctx.beginPath()
      ctx.moveTo(hx - 10, GROUND - hh)
      ctx.lineTo(hx + 55, GROUND - hh - 36)
      ctx.lineTo(hx + 120, GROUND - hh)
      ctx.fill()
    }
    // 窓明かり
    ctx.fillStyle = '#ffd166'
    for (let i = 0; i < 6; i++) {
      const hx = 40 + i * 170
      ctx.fillRect(hx + 18, GROUND - 44, 14, 14)
      ctx.fillRect(hx + 66, GROUND - 44, 14, 14)
    }
    // 地面
    ctx.fillStyle = '#3f3a3a'
    ctx.fillRect(0, GROUND, VIEW_W, VIEW_H - GROUND)
    ctx.fillStyle = '#575050'
    ctx.fillRect(0, GROUND, VIEW_W, 6)
  }

  /** バトル画面専用: 実写ステージ写真を背景に使う。未ロードならイラスト背景にフォールバック。 */
  private renderStageBg(ctx: CanvasRenderingContext2D) {
    const img = getStageImage(this.stageIndex)
    if (!img) {
      this.renderBg(ctx)
      return
    }
    ctx.drawImage(img, 0, 0, VIEW_W, VIEW_H)
    // 夕景トーンに寄せる雰囲気合わせのオーバーレイ
    const tint = ctx.createLinearGradient(0, 0, 0, VIEW_H)
    tint.addColorStop(0, 'rgba(43,30,78,0.45)')
    tint.addColorStop(0.55, 'rgba(122,59,110,0.28)')
    tint.addColorStop(1, 'rgba(20,14,20,0.55)')
    ctx.fillStyle = tint
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    // 足元のコントラスト用に地面帯を軽く暗く
    ctx.fillStyle = 'rgba(10,8,10,0.35)'
    ctx.fillRect(0, GROUND, VIEW_W, VIEW_H - GROUND)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(0, GROUND, VIEW_W, 3)
  }

  private renderTitle(ctx: CanvasRenderingContext2D) {
    const img = getTitleImage()
    if (img) {
      ctx.drawImage(img, 0, 0, VIEW_W, VIEW_H)
    } else {
      this.renderBg(ctx)
    }
    ctx.textAlign = 'center'

    // 下部の文字を読みやすくするグラデーション
    const grad = ctx.createLinearGradient(0, VIEW_H - 96, 0, VIEW_H)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0.8)')
    ctx.fillStyle = grad
    ctx.fillRect(0, VIEW_H - 96, VIEW_W, 96)

    if (Math.floor(this.frame / 30) % 2 === 0) {
      ctx.font = this.font(26)
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 5
      ctx.strokeText('タップ / 何かキーを押してスタート', VIEW_W / 2, VIEW_H - 46)
      ctx.fillStyle = '#ffffff'
      ctx.fillText('タップ / 何かキーを押してスタート', VIEW_W / 2, VIEW_H - 46)
    }
    ctx.font = this.font(14, false)
    ctx.fillStyle = '#cbd5e1'
    ctx.fillText('PC: 1P=WASD+F/G/H/Space  2P=矢印+J/K/L/Enter  (M:ミュート)', VIEW_W / 2, VIEW_H - 16)
    ctx.textAlign = 'left'
  }

  private renderMode(ctx: CanvasRenderingContext2D) {
    this.renderBg(ctx)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffffff'
    ctx.font = this.font(34)
    ctx.fillText('モードせんたく', VIEW_W / 2, 96)

    const items = ['1P vs CPU', '1P vs 2P (ローカル対戦)', 'アーケード(強敵に挑戦!)']
    items.forEach((label, i) => {
      const y = 170 + i * 80
      const rect: Rect = { x: VIEW_W / 2 - 240, y: y - 36, w: 480, h: 58 }
      ctx.fillStyle = this.modeCursor === i ? '#dc2626' : 'rgba(255,255,255,0.12)'
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
      ctx.strokeStyle = i === 2 ? '#c9a227' : '#ffffff'
      ctx.lineWidth = 3
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
      ctx.fillStyle = '#ffffff'
      ctx.font = this.font(26)
      ctx.fillText(label, VIEW_W / 2, y)
      this.tapRects.push({
        rect,
        act: () => this.selectMode(i),
      })
    })
    ctx.font = this.font(15, false)
    ctx.fillStyle = '#cbd5e1'
    ctx.fillText('アーケードは猫や強敵を倒してラスボス「道代」を目指すモード', VIEW_W / 2, 430)
    ctx.fillText('スマホは 1P vs CPU がおすすめ(タップで決定)', VIEW_W / 2, 452)
    ctx.textAlign = 'left'
  }

  private renderSelect(ctx: CanvasRenderingContext2D) {
    const bgImg = getSelectImage()
    if (bgImg) {
      ctx.drawImage(bgImg, 0, 0, VIEW_W, VIEW_H)
    } else {
      this.renderBg(ctx)
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffffff'
    ctx.font = this.font(30)
    const who = this.picker === 0 ? '1P' : this.vsCpu ? 'CPU(あいて)' : '2P'
    ctx.fillText(`${who} のキャラをえらんでね`, VIEW_W / 2, 52)

    // 3x3グリッド
    const cell = 108
    const gx = VIEW_W / 2 - cell * 1.5 - 150
    const gy = 90
    CHARACTERS.forEach((d, i) => {
      const cx = gx + (i % 3) * (cell + 10)
      const cy = gy + Math.floor(i / 3) * (cell + 10)
      const rect: Rect = { x: cx, y: cy, w: cell, h: cell }
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.fillRect(cx, cy, cell, cell)
      if (this.picked[0] === i) {
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 5
        ctx.strokeRect(cx + 2, cy + 2, cell - 4, cell - 4)
      }
      const curIdx = this.selCursor[this.picker]
      if (curIdx === i) {
        ctx.strokeStyle = this.picker === 0 ? '#ef4444' : '#3b82f6'
        ctx.lineWidth = 5
        ctx.strokeRect(cx + 2, cy + 2, cell - 4, cell - 4)
      }
      this.drawPortrait(ctx, d, cx + cell / 2, cy + cell - 14, 74, 1, curIdx === i ? 'special' : 'idle', this.frame)
      ctx.fillStyle = '#ffffff'
      ctx.font = this.font(15)
      ctx.fillText(d.name, cx + cell / 2, cy + cell - 4)
      this.tapRects.push({
        rect,
        act: () => {
          // タップは見るだけ(プレビュー)。決定は下の「けってい」ボタンで行う。
          if (this.selCursor[this.picker] !== i) {
            this.selCursor[this.picker] = i
            this.audio.sfx('select')
          }
        },
      })
    })

    // 決定/戻るボタン(グリッド下の余白)
    const btnY = gy + 3 * (cell + 10) - 10 + 14
    const btnH = 46
    if (this.picker === 1) {
      const backRect: Rect = { x: gx, y: btnY, w: 160, h: btnH }
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      ctx.fillRect(backRect.x, backRect.y, backRect.w, backRect.h)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.strokeRect(backRect.x, backRect.y, backRect.w, backRect.h)
      ctx.fillStyle = '#ffffff'
      ctx.font = this.font(18)
      ctx.textAlign = 'center'
      ctx.fillText('もどる', backRect.x + backRect.w / 2, backRect.y + btnH / 2 + 6)
      ctx.textAlign = 'left'
      this.tapRects.push({
        rect: backRect,
        act: () => {
          this.picker = 0
          this.picked[0] = -1
          this.audio.sfx('error')
        },
      })
    }
    const confirmRect: Rect =
      this.picker === 1 ? { x: gx + 170, y: btnY, w: gx + 3 * (cell + 10) - 10 - (gx + 170), h: btnH } : { x: gx, y: btnY, w: 3 * (cell + 10) - 10, h: btnH }
    ctx.fillStyle = '#dc2626'
    ctx.fillRect(confirmRect.x, confirmRect.y, confirmRect.w, confirmRect.h)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 3
    ctx.strokeRect(confirmRect.x, confirmRect.y, confirmRect.w, confirmRect.h)
    ctx.fillStyle = '#ffffff'
    ctx.font = this.font(22)
    ctx.textAlign = 'center'
    ctx.fillText('けってい', confirmRect.x + confirmRect.w / 2, confirmRect.y + btnH / 2 + 7)
    ctx.textAlign = 'left'
    this.tapRects.push({
      rect: confirmRect,
      act: () => this.confirmSelect(this.selCursor[this.picker]),
    })

    // 選択中キャラの詳細
    const d = CHARACTERS[this.selCursor[this.picker]]
    const px = VIEW_W / 2 + 120
    const textX = px + 110
    const textMaxW = px + 340 - textX - 8
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(px - 20, 90, 360, 420)
    this.drawPortrait(ctx, d, px + 40, 300, d.heightCm * 1.05, 1, 'special', this.frame)
    ctx.fillStyle = d.accent
    ctx.font = this.font(30)
    ctx.fillText(`${d.name}`, textX, 130)
    ctx.fillStyle = '#e2e8f0'
    ctx.font = this.font(15, false)
    ctx.fillText(`${d.age}歳・${d.sex} / ${d.heightCm}cm ${d.weightKg}kg`, textX, 158)
    ctx.fillText(d.typeDesc, textX, 180)

    let my = 213
    const drawMove = (label: string, move: MoveDef) => {
      ctx.fillStyle = '#fbbf24'
      ctx.font = this.font(15)
      ctx.fillText(`${label}: ${move.name}`, textX, my)
      my += 17
      if (move.desc) {
        ctx.fillStyle = '#b9c2cf'
        ctx.font = this.font(12, false)
        for (const line of this.wrapText(ctx, move.desc, textMaxW)) {
          ctx.fillText(line, textX, my)
          my += 15
        }
      }
      my += 8
    }
    drawMove('特殊', d.unique)
    drawMove('必殺', d.sp1)
    drawMove('超必殺', d.sp2)

    ctx.fillStyle = '#cbd5e1'
    ctx.font = this.font(13, false)
    ctx.fillText(`HP ${d.hp} / スピード ${d.speed}`, textX, my + 6)

    ctx.textAlign = 'center'
    ctx.fillStyle = '#cbd5e1'
    ctx.font = this.font(16, false)
    ctx.fillText('タップでキャラを見て「けってい」で確定 / キーボードは移動キー+パンチでも決定', VIEW_W / 2, VIEW_H - 18)
    ctx.textAlign = 'left'
  }

  private renderBattle(ctx: CanvasRenderingContext2D) {
    if (!this.fighters) return
    const [f1, f2] = this.fighters

    ctx.save()
    if (this.shake > 0.5) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake)
    }

    this.renderStageBg(ctx)

    // バリア(洗濯物)
    for (const b of this.barriers) this.drawBarrier(ctx, b)

    // ファイター(後ろの人から)
    const order = f1.y <= f2.y ? [f1, f2] : [f2, f1]
    for (const f of order) this.drawFighter(ctx, f)

    // 飛び道具
    for (const p of this.projectiles) this.drawProjectile(ctx, p)

    // パーティクル
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.t / p.max
      ctx.fillStyle = p.color
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
    }
    ctx.globalAlpha = 1

    // ダメージ数字
    for (const d of this.dmgNums) {
      ctx.globalAlpha = 1 - d.t / 50
      ctx.textAlign = 'center'
      ctx.font = this.font(d.val >= 100 ? 30 : 22)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 4
      const txt = d.val < 0 ? 'ゲージ不足!' : String(d.val)
      ctx.strokeText(txt, d.x, d.y)
      ctx.fillStyle = d.color
      ctx.fillText(txt, d.x, d.y)
    }
    ctx.globalAlpha = 1

    // 目潰しオーバーレイ
    for (const f of this.fighters) {
      if (f.has('blind')) {
        ctx.save()
        ctx.fillStyle = 'rgba(0,0,0,0.86)'
        ctx.beginPath()
        ctx.rect(0, 0, VIEW_W, VIEW_H)
        ctx.arc(f.x, f.y - f.hPx / 2, 110, 0, Math.PI * 2, true)
        ctx.fill('evenodd')
        ctx.restore()
        ctx.textAlign = 'center'
        ctx.fillStyle = '#e2e8f0'
        ctx.font = this.font(18)
        ctx.fillText(`${f.def.name} は目が見えない!`, VIEW_W / 2, VIEW_H - 40)
      }
    }

    ctx.restore()

    this.renderHud(ctx, f1, f2)

    // 技名バナー
    this.banners.forEach((b, i) => {
      const p = b.t / b.max
      const pop = Math.min(1, b.t / 6)
      ctx.save()
      ctx.globalAlpha = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1
      ctx.translate(VIEW_W / 2, 190 + i * 56)
      ctx.scale(pop, pop)
      ctx.textAlign = 'center'
      ctx.font = this.font(b.text === 'K.O.' ? 96 : 42)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 8
      ctx.strokeText(b.text, 0, 0)
      ctx.fillStyle = b.color
      ctx.fillText(b.text, 0, 0)
      if (b.sub) {
        ctx.font = this.font(18)
        ctx.fillStyle = '#fff'
        ctx.fillText(b.sub, 0, 26)
      }
      ctx.restore()
    })

    // イントロ表示
    if (this.phase === 'intro') {
      ctx.textAlign = 'center'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 8
      if (this.phaseT < 70) {
        if (this.isArcade) {
          const boss = f2.def.isBoss
          ctx.font = this.font(boss ? 46 : 56)
          const txt = boss ? `LAST BOSS 「${f2.def.name}」現る…!` : `${f2.def.name} 参上!`
          ctx.strokeText(txt, VIEW_W / 2, 260)
          ctx.fillStyle = boss ? '#c9a227' : '#ffd60a'
          ctx.fillText(txt, VIEW_W / 2, 260)
        } else {
          ctx.font = this.font(64)
          const txt = `ROUND ${this.roundNo}`
          ctx.strokeText(txt, VIEW_W / 2, 260)
          ctx.fillStyle = '#ffd60a'
          ctx.fillText(txt, VIEW_W / 2, 260)
        }
      } else {
        ctx.font = this.font(64)
        ctx.strokeText('FIGHT!', VIEW_W / 2, 260)
        ctx.fillStyle = '#ff453a'
        ctx.fillText('FIGHT!', VIEW_W / 2, 260)
      }
      ctx.textAlign = 'left'
    }
  }

  private renderHud(ctx: CanvasRenderingContext2D, f1: Fighter, f2: Fighter) {
    const barW = 380
    const drawBar = (f: Fighter, x: number, rightAlign: boolean) => {
      const ratio = Math.max(0, f.hp / f.def.hp)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(x - 3, 15, barW + 6, 26)
      ctx.fillStyle = '#57534e'
      ctx.fillRect(x, 18, barW, 20)
      const grad = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#eab308' : '#ef4444'
      ctx.fillStyle = grad
      const w = barW * ratio
      ctx.fillRect(rightAlign ? x + barW - w : x, 18, w, 20)
      // 名前
      ctx.font = this.font(17)
      ctx.textAlign = rightAlign ? 'right' : 'left'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(f.def.name, rightAlign ? x + barW : x, 60)
      // ラウンド取得
      for (let i = 0; i < this.roundsToWin; i++) {
        const cx = rightAlign ? x + barW - 90 - i * 22 : x + 90 + i * 22
        ctx.beginPath()
        ctx.arc(cx, 54, 8, 0, Math.PI * 2)
        ctx.fillStyle = this.wins[f.idx] > i ? '#ffd60a' : 'rgba(255,255,255,0.25)'
        ctx.fill()
      }
      // 必殺技ゲージ
      const my = VIEW_H - 34
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(x - 3, my - 3, barW * 0.7 + 6, 20)
      ctx.fillStyle = '#334155'
      ctx.fillRect(x, my, barW * 0.7, 14)
      const mw = barW * 0.7 * (f.meter / 100)
      ctx.fillStyle = f.meter >= 100 ? '#f97316' : f.meter >= 50 ? '#38bdf8' : '#64748b'
      ctx.fillRect(rightAlign ? x + barW * 0.7 - mw : x, my, mw, 14)
      ctx.font = this.font(12)
      ctx.fillStyle = '#fff'
      ctx.textAlign = rightAlign ? 'right' : 'left'
      const label = f.meter >= 100 ? '超必殺OK!' : f.meter >= 50 ? '必殺OK!' : '必殺ゲージ'
      ctx.fillText(label, rightAlign ? x + barW * 0.7 : x, my - 7)
    }
    drawBar(f1, 20, false)
    drawBar(f2, VIEW_W - 20 - barW, true)

    // タイマー
    ctx.textAlign = 'center'
    ctx.font = this.font(34)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 5
    const sec = Math.max(0, Math.ceil(this.timer / 60))
    ctx.strokeText(String(sec), VIEW_W / 2, 44)
    ctx.fillStyle = sec <= 10 ? '#ff453a' : '#ffffff'
    ctx.fillText(String(sec), VIEW_W / 2, 44)
    ctx.textAlign = 'left'
  }

  private renderResult(ctx: CanvasRenderingContext2D) {
    this.renderBg(ctx)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    if (!this.fighters) return
    const winner = this.matchWinner >= 0 ? this.fighters[this.matchWinner] : null

    const cleared = this.isArcade && this.matchWinner === 0 && this.arcadeIndex === ARCADE_QUEUE.length - 1

    ctx.textAlign = 'center'
    if (winner) {
      this.drawPortrait(ctx, winner.def, VIEW_W / 2, 320, winner.def.species === 'cat' ? 150 : 200, 1, 'special', this.frame)
      if (cleared) {
        ctx.font = this.font(46)
        ctx.strokeStyle = '#000'
        ctx.lineWidth = 8
        ctx.strokeText('GAME CLEAR!!', VIEW_W / 2, 100)
        ctx.fillStyle = '#c9a227'
        ctx.fillText('GAME CLEAR!!', VIEW_W / 2, 100)
        ctx.font = this.font(24)
        ctx.strokeText('道代を打ち倒した!', VIEW_W / 2, 140)
        ctx.fillStyle = '#ffd60a'
        ctx.fillText('道代を打ち倒した!', VIEW_W / 2, 140)
      } else {
        ctx.font = this.font(56)
        ctx.strokeStyle = '#000'
        ctx.lineWidth = 8
        const label = `${winner.def.name} の勝ち!`
        ctx.strokeText(label, VIEW_W / 2, 110)
        ctx.fillStyle = '#ffd60a'
        ctx.fillText(label, VIEW_W / 2, 110)
      }
    }

    const items = this.isArcade
      ? ['もういちど対戦', 'アーケードを最初から', 'タイトルへ']
      : ['もういちど対戦', 'キャラをえらびなおす', 'タイトルへ']
    items.forEach((label, i) => {
      const y = 390 + i * 52
      const rect: Rect = { x: VIEW_W / 2 - 190, y: y - 30, w: 380, h: 42 }
      ctx.fillStyle = this.resultCursor === i ? '#dc2626' : 'rgba(255,255,255,0.12)'
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
      ctx.fillStyle = '#fff'
      ctx.font = this.font(22)
      ctx.fillText(label, VIEW_W / 2, y)
      this.tapRects.push({
        rect,
        act: () => {
          this.resultCursor = i
          this.audio.sfx('confirm')
          if (i === 0) this.startMatch()
          else if (i === 1) this.gotoSelect()
          else this.gotoTitle()
        },
      })
    })
    ctx.textAlign = 'left'
  }

  // ---------- ファイター/オブジェクト描画 ----------

  private drawFighter(ctx: CanvasRenderingContext2D, f: Fighter) {
    let pose: Pose = 'idle'
    if (f.state === 'ko') pose = 'ko'
    else if (f.state === 'hitstun') pose = 'hit'
    else if (f.state === 'jump' || !f.grounded) pose = 'jump'
    else if (f.state === 'attack' && f.move) {
      if (f.move.meterCost || f.move.type === 'aura' || f.move.type === 'taunt' || f.move.type === 'projectile') pose = 'special'
      else if (f.move === f.def.kick || f.move.name.includes('キック') || f.move.name.includes('蹴')) pose = 'kick'
      else pose = 'punch'
    } else if (f.state === 'walk') pose = 'walk'
    const guarding = this.fighters
      ? this.isGuarding(
          f,
          this.fighters[f.idx === 0 ? 1 : 0],
          this.vsCpu && f.idx === 1 ? this.aiInputObj : this.inputs[f.idx]
        )
      : false
    if (guarding) pose = 'guard'

    // 隠れ筋肉小ネタ: 必殺技の発動中だけ一瞬マッチョな姿がよぎる
    const buffFlash = !!(
      f.def.secretBuff &&
      f.state === 'attack' &&
      f.move?.meterCost &&
      f.moveT > f.move.startup &&
      f.moveT <= f.move.startup + f.move.active
    )
    if (buffFlash) {
      ctx.save()
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(f.animT / 2)
      ctx.fillStyle = '#ffd60a'
      ctx.beginPath()
      ctx.arc(f.x, f.y - f.hPx / 2, f.hPx * 0.7, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    const sprites = getSprites(f.def.id)
    const drawn = sprites && this.drawSpriteFighter(ctx, sprites, POSE_TO_SPRITE[pose], f)
    if (!drawn) {
      const drawDef: CharDef = buffFlash ? { ...f.def, shirt: f.def.skin, widthScale: f.def.widthScale * 1.2 } : f.def
      const drawFn = f.def.species === 'cat' ? drawCat : drawCharacter
      drawFn(ctx, drawDef, f.x, f.y, f.hPx, f.facing, pose, f.animT)
    }
    if (buffFlash) {
      ctx.font = '22px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('💪', f.x + f.facing * f.wPx * 0.7, f.y - f.hPx - 8)
    }

    // 状態異常アイコン
    const active = (Object.keys(f.statuses) as StatusKind[]).filter((k) => f.has(k))
    active.forEach((k, i) => {
      ctx.font = '18px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(STATUS_INFO[k].icon, f.x - (active.length - 1) * 12 + i * 24, f.y - f.hPx - 12)
    })
    // 拘束・気絶の視覚表現
    if (f.has('charm')) {
      ctx.font = '16px sans-serif'
      ctx.fillText('💕', f.x + Math.sin(f.animT / 10) * 20, f.y - f.hPx - 30)
    }
  }

  /** ファイター以外(タイトル整列・キャラ選択・リザルト)向けの汎用描画。スプライトがあればそれを、無ければプログラム描画を使う。 */
  private drawPortrait(
    ctx: CanvasRenderingContext2D,
    d: CharDef,
    x: number,
    yFeet: number,
    h: number,
    facing: 1 | -1,
    pose: Pose,
    animT: number
  ) {
    const sprites = getSprites(d.id)
    if (sprites) {
      const picked = pickSprite(sprites, POSE_TO_SPRITE[pose])
      if (picked) {
        const { img, anchor } = picked
        const scale = h / sprites.bodyPxHeight
        const drawW = img.naturalWidth * scale
        const drawH = img.naturalHeight * scale
        ctx.save()
        ctx.translate(x, yFeet)
        ctx.scale(facing, 1)
        ctx.drawImage(img, -anchor.centerXFrac * drawW, -anchor.feetYFrac * drawH, drawW, drawH)
        ctx.restore()
        return
      }
    }
    const drawFn = d.species === 'cat' ? drawCat : drawCharacter
    drawFn(ctx, d, x, yFeet, h, facing, pose, animT)
  }

  /** AI生成スプライトで描画できたらtrue。まだ画像が揃っていなければfalse(呼び出し側がプログラム描画にフォールバック)。 */
  private drawSpriteFighter(
    ctx: CanvasRenderingContext2D,
    sprites: ReturnType<typeof getSprites>,
    pose: SpritePose,
    f: Fighter
  ): boolean {
    if (!sprites) return false
    const picked = pickSprite(sprites, pose)
    if (!picked) return false
    const { img, anchor } = picked
    const scale = f.hPx / sprites.bodyPxHeight
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    const drawW = iw * scale
    const drawH = ih * scale
    const anchorX = anchor.centerXFrac * drawW
    const anchorY = anchor.feetYFrac * drawH

    ctx.save()
    ctx.translate(f.x, f.y)
    ctx.scale(f.facing, 1)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(0, 2, f.wPx * 1.3, f.hPx * 0.07, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.drawImage(img, -anchorX, -anchorY, drawW, drawH)
    ctx.restore()
    return true
  }

  private drawBarrier(ctx: CanvasRenderingContext2D, b: Barrier) {
    // 洗濯物: 物干し竿+ひらひら
    ctx.save()
    ctx.globalAlpha = Math.min(1, b.t / 20)
    const img = getFxImage('laundry')
    if (img) {
      const w = b.w * 1.3
      const h = img.naturalHeight * (w / img.naturalWidth)
      const sway = Math.sin(this.frame / 6) * 6
      ctx.drawImage(img, b.x - w / 2 + sway, b.y - b.h, w, h)
    } else {
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(b.x - b.w / 2, b.y - b.h)
      ctx.lineTo(b.x + b.w / 2, b.y - b.h)
      ctx.stroke()
      const colors = ['#f8fafc', '#93c5fd', '#fda4af']
      for (let i = 0; i < 3; i++) {
        const cx = b.x - b.w / 2 + (b.w / 3) * i + b.w / 6
        const sway = Math.sin((this.frame + i * 20) / 6) * 10
        ctx.fillStyle = colors[i]
        ctx.beginPath()
        ctx.moveTo(cx - 16, b.y - b.h)
        ctx.lineTo(cx + 16, b.y - b.h)
        ctx.lineTo(cx + 12 + sway, b.y - b.h + 52)
        ctx.lineTo(cx - 12 + sway, b.y - b.h + 52)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile) {
    ctx.save()
    ctx.translate(p.x, p.y)
    const dir = p.vx >= 0 ? 1 : -1
    switch (p.kind) {
      case 'table': {
        const img = getFxImage('table')
        ctx.rotate((this.frame / 5) * dir)
        if (img) {
          drawFxImage(ctx, img, p.w)
        } else {
          ctx.fillStyle = '#8b5a2b'
          ctx.fillRect(-p.w / 2, -8, p.w, 16)
          ctx.fillStyle = '#6b4423'
          ctx.fillRect(-p.w / 2 + 6, 8, 8, 14)
          ctx.fillRect(p.w / 2 - 14, 8, 8, 14)
        }
        break
      }
      case 'paper': {
        const img = getFxImage('paper')
        if (img) {
          ctx.scale(dir, 1)
          drawFxImage(ctx, img, p.w)
        } else {
          ctx.rotate(Math.sin(this.frame / 3) * 0.5)
          ctx.fillStyle = '#f8fafc'
          ctx.fillRect(-p.w / 2, -3, p.w, 6)
          ctx.fillStyle = '#e2e8f0'
          ctx.fillRect(-p.w / 2, -1, p.w, 2)
        }
        break
      }
      case 'cosme': {
        const img = getFxImage('cosme')
        if (img) {
          ctx.scale(dir, 1)
          drawFxImage(ctx, img, p.w)
        } else {
          ctx.fillStyle = '#f472b6'
          ctx.fillRect(-8, -10, 16, 20)
          ctx.fillStyle = '#be185d'
          ctx.fillRect(-8, -10, 16, 6)
        }
        break
      }
      case 'coin': {
        const img = getFxImage('coin')
        if (img) {
          ctx.scale(dir, 1)
          drawFxImage(ctx, img, p.w)
        } else {
          ctx.fillStyle = '#fbbf24'
          ctx.beginPath()
          ctx.arc(0, 0, 7, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#92400e'
          ctx.lineWidth = 2
          ctx.stroke()
        }
        break
      }
      case 'booger': {
        const img = getFxImage('booger')
        if (img) {
          ctx.scale(dir, 1)
          drawFxImage(ctx, img, p.w)
        } else {
          ctx.fillStyle = '#84cc16'
          ctx.beginPath()
          ctx.arc(0, 0, 7, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#a3e635'
          ctx.beginPath()
          ctx.arc(-2, -2, 3, 0, Math.PI * 2)
          ctx.fill()
        }
        break
      }
      case 'bug': {
        // 毛玉の群れ(チャチャ)
        for (let i = 0; i < 9; i++) {
          const bx = ((Math.sin(p.seed + i * 2.1) + 1) / 2 - 0.5) * p.w
          const by = ((Math.cos(p.seed + i * 1.7 + this.frame / 8) + 1) / 2 - 0.5) * p.h
          ctx.fillStyle = '#65a30d'
          ctx.fillRect(bx - 5, by - 2, 10, 5)
          ctx.fillStyle = '#365314'
          ctx.fillRect(bx + (dir > 0 ? 3 : -5), by - 3, 3, 3)
        }
        break
      }
      case 'locust': {
        const img = getFxImage('bug')
        if (img) {
          ctx.scale(dir, 1)
          drawFxImage(ctx, img, p.w)
        } else {
          for (let i = 0; i < 9; i++) {
            const bx = ((Math.sin(p.seed + i * 2.1) + 1) / 2 - 0.5) * p.w
            const by = ((Math.cos(p.seed + i * 1.7 + this.frame / 8) + 1) / 2 - 0.5) * p.h
            ctx.fillStyle = '#65a30d'
            ctx.fillRect(bx - 5, by - 2, 10, 5)
            ctx.fillStyle = '#365314'
            ctx.fillRect(bx + (dir > 0 ? 3 : -5), by - 3, 3, 3)
          }
        }
        break
      }
      case 'shock': {
        const shockImg = getFxImage('shock')
        if (shockImg) {
          drawFxImage(ctx, shockImg, p.w)
          break
        }
        ctx.strokeStyle = '#fef08a'
        ctx.lineWidth = 4
        ctx.beginPath()
        let zx = -p.w / 2
        ctx.moveTo(zx, 0)
        while (zx < p.w / 2) {
          zx += 12
          ctx.lineTo(zx, (Math.random() - 0.5) * p.h)
        }
        ctx.stroke()
        ctx.strokeStyle = '#60a5fa'
        ctx.lineWidth = 2
        ctx.stroke()
        break
      }
      case 'car': {
        const img = getFxImage('car')
        ctx.scale(dir, 1)
        if (img) {
          drawFxImage(ctx, img, p.w)
        } else {
          ctx.fillStyle = '#dc2626'
          ctx.fillRect(-p.w / 2, -p.h / 2 + 14, p.w, p.h - 26)
          ctx.fillStyle = '#7f1d1d'
          ctx.fillRect(-p.w / 2 + 20, -p.h / 2, p.w - 56, 22)
          ctx.fillStyle = '#bfdbfe'
          ctx.fillRect(-p.w / 2 + 26, -p.h / 2 + 3, 30, 16)
          ctx.fillRect(-p.w / 2 + 62, -p.h / 2 + 3, 30, 16)
          ctx.fillStyle = '#1c1917'
          ctx.beginPath()
          ctx.arc(-p.w / 2 + 30, p.h / 2 - 8, 13, 0, Math.PI * 2)
          ctx.arc(p.w / 2 - 30, p.h / 2 - 8, 13, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#fde047'
          ctx.fillRect(p.w / 2 - 8, -6, 8, 10)
        }
        break
      }
    }
    ctx.restore()
  }
}

// ---------- キャラクター描画(共通) ----------

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  d: CharDef,
  x: number,
  yFeet: number,
  h: number,
  facing: 1 | -1,
  pose: Pose,
  animT: number
) {
  const u = h / 16
  const ws = d.widthScale
  ctx.save()
  ctx.translate(x, yFeet)

  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(0, 2, u * 3.4 * ws, u * 0.8, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.scale(facing, 1)

  if (pose === 'ko') {
    // 仰向けに倒れる
    ctx.rotate(-Math.PI / 2)
    ctx.translate(u * 1.2, 0)
  }

  const bob = pose === 'idle' ? Math.sin(animT / 14) * u * 0.18 : 0
  const walkSwing = pose === 'walk' ? Math.sin(animT / 5) : 0
  const legH = 6.2 * u
  const torsoH = 5.4 * u
  const torsoW = 4.6 * u * ws
  const headR = 2.1 * u
  const hipY = -legH + bob

  // 後ろ脚
  ctx.fillStyle = d.pants
  const legW = 1.5 * u * ws
  if (pose === 'kick') {
    // 前脚を蹴り出す
    ctx.fillRect(-legW * 1.2, hipY, legW, legH) // 軸足
    ctx.save()
    ctx.translate(0, hipY + u)
    ctx.rotate(-Math.PI / 2.4)
    ctx.fillRect(0, -legW / 2, legH * 1.15, legW)
    ctx.fillStyle = d.skin
    ctx.fillRect(legH * 1.15, -legW / 2, u, legW) // 足先
    ctx.restore()
  } else if (pose === 'jump') {
    ctx.fillRect(-legW * 1.4, hipY, legW, legH * 0.6)
    ctx.fillRect(legW * 0.3, hipY, legW, legH * 0.75)
  } else if (pose === 'ko') {
    ctx.fillRect(-legW * 1.4, hipY, legW, legH)
    ctx.fillRect(legW * 0.3, hipY, legW, legH)
  } else {
    const s1 = walkSwing * u * 0.9
    const s2 = -walkSwing * u * 0.9
    ctx.fillRect(-legW * 1.4 + s1, hipY, legW, legH)
    ctx.fillRect(legW * 0.3 + s2, hipY, legW, legH)
  }

  // 胴体
  const torsoY = hipY - torsoH
  ctx.fillStyle = d.shirt
  const lean = pose === 'hit' ? -u * 0.8 : pose === 'punch' ? u * 0.5 : 0
  ctx.fillRect(-torsoW / 2 + lean * 0.3, torsoY, torsoW, torsoH + u * 0.2)

  // 腕
  const shoulderY = torsoY + u * 0.8
  const armW = 1.2 * u * ws
  ctx.fillStyle = d.shirt
  if (pose === 'punch') {
    // 前腕伸ばし
    ctx.fillRect(0, shoulderY, 4.6 * u, armW)
    ctx.fillStyle = d.skin
    ctx.fillRect(4.6 * u, shoulderY - u * 0.15, 1.3 * u, armW * 1.2) // 拳
    ctx.fillStyle = d.shirt
    ctx.fillRect(-torsoW / 2 - armW * 0.4, shoulderY, armW, 3 * u) // 後ろ腕
  } else if (pose === 'special') {
    // 両腕を上げる
    ctx.fillRect(torsoW / 2 - armW * 0.4, shoulderY - 3 * u, armW, 3.4 * u)
    ctx.fillRect(-torsoW / 2 - armW * 0.6, shoulderY - 3 * u, armW, 3.4 * u)
    ctx.fillStyle = d.skin
    ctx.fillRect(torsoW / 2 - armW * 0.4, shoulderY - 4 * u, armW, u)
    ctx.fillRect(-torsoW / 2 - armW * 0.6, shoulderY - 4 * u, armW, u)
  } else if (pose === 'guard') {
    // 腕を前でクロス
    ctx.fillRect(u * 0.6, shoulderY - u * 0.4, armW * 1.3, 3.4 * u)
    ctx.fillRect(u * 1.6, shoulderY + u * 0.2, armW * 1.3, 3 * u)
  } else if (pose === 'hit' || pose === 'ko') {
    ctx.fillRect(-torsoW / 2 - armW, shoulderY - u, armW, 3 * u)
    ctx.fillRect(torsoW / 2 - armW * 0.2, shoulderY - u * 0.5, armW, 3 * u)
  } else {
    const s = walkSwing * u * 0.7
    ctx.fillRect(torsoW / 2 - armW * 0.3, shoulderY + s * 0.3, armW, 3.6 * u)
    ctx.fillRect(-torsoW / 2 - armW * 0.7, shoulderY - s * 0.3, armW, 3.6 * u)
  }

  // 頭
  const headY = torsoY - headR + u * 0.2 + (pose === 'hit' ? u * 0.3 : 0)
  ctx.fillStyle = d.skin
  ctx.beginPath()
  ctx.arc(lean, headY, headR, 0, Math.PI * 2)
  ctx.fill()

  // 髪
  ctx.fillStyle = d.hair
  switch (d.hairStyle) {
    case 'grandpa':
      // 側頭部のみ+眉
      ctx.beginPath()
      ctx.arc(lean, headY, headR * 1.02, Math.PI * 0.85, Math.PI * 1.45)
      ctx.lineWidth = u * 0.7
      ctx.strokeStyle = d.hair
      ctx.stroke()
      break
    case 'short':
      ctx.beginPath()
      ctx.arc(lean, headY - headR * 0.15, headR * 1.02, Math.PI * 0.95, Math.PI * 2.0)
      ctx.fill()
      break
    case 'buzz':
      ctx.beginPath()
      ctx.arc(lean, headY - headR * 0.2, headR * 0.95, Math.PI, Math.PI * 2)
      ctx.fill()
      break
    case 'bob':
      ctx.beginPath()
      ctx.arc(lean, headY - headR * 0.1, headR * 1.08, Math.PI * 0.8, Math.PI * 2.15)
      ctx.fill()
      ctx.fillRect(lean - headR * 1.05, headY - headR * 0.2, headR * 0.5, headR * 1.3)
      break
    case 'long':
      ctx.beginPath()
      ctx.arc(lean, headY - headR * 0.1, headR * 1.06, Math.PI * 0.75, Math.PI * 2.2)
      ctx.fill()
      ctx.fillRect(lean - headR * 1.1, headY - headR * 0.3, headR * 0.55, headR * 2.6)
      break
    case 'ponytail':
      ctx.beginPath()
      ctx.arc(lean, headY - headR * 0.15, headR * 1.04, Math.PI * 0.9, Math.PI * 2.05)
      ctx.fill()
      ctx.save()
      ctx.translate(lean - headR * 0.9, headY - headR * 0.5)
      ctx.rotate(0.5 + Math.sin(animT / 10) * 0.1)
      ctx.fillRect(-headR * 0.35, 0, headR * 0.7, headR * 1.9)
      ctx.restore()
      break
    case 'twintail':
      ctx.beginPath()
      ctx.arc(lean, headY - headR * 0.15, headR * 1.04, Math.PI * 0.9, Math.PI * 2.05)
      ctx.fill()
      ctx.fillRect(lean - headR * 1.35, headY - headR * 0.2, headR * 0.5, headR * 1.8)
      ctx.fillRect(lean + headR * 0.9, headY - headR * 0.2, headR * 0.5, headR * 1.8)
      break
  }

  // 根元の地毛(染めキャラの二層表現)
  if (d.hairRoot) {
    ctx.strokeStyle = d.hairRoot
    ctx.lineWidth = u * 0.32
    ctx.beginPath()
    ctx.arc(lean, headY - headR * 0.08, headR * 0.92, Math.PI * 0.88, Math.PI * 1.4)
    ctx.stroke()
  }

  // 目
  ctx.fillStyle = '#1c1917'
  if (pose === 'ko') {
    ctx.font = `${u * 1.6}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('×', lean + headR * 0.45, headY + u * 0.4)
  } else {
    ctx.fillRect(lean + headR * 0.35, headY - u * 0.25, u * 0.45, u * 0.5)
  }

  ctx.restore()
}

// ---------- 猫キャラクター描画(敵キャラ用) ----------

export function drawCat(
  ctx: CanvasRenderingContext2D,
  d: CharDef,
  x: number,
  yFeet: number,
  h: number,
  facing: 1 | -1,
  pose: Pose,
  animT: number
) {
  const u = h / 10
  const ws = d.widthScale
  const legScale = d.catLegScale ?? 1
  const fur = d.furColor ?? d.skin
  const accent = d.furAccent ?? '#ffffff'
  const eye = d.eyeColor ?? '#1c1917'

  ctx.save()
  ctx.translate(x, yFeet)

  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(0, 2, u * 3.6 * ws, u * 0.8, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.scale(facing, 1)

  if (pose === 'ko') {
    ctx.rotate(-Math.PI / 2)
    ctx.translate(u * 1.2, 0)
  }

  const bob = pose === 'idle' ? Math.sin(animT / 14) * u * 0.15 : 0
  const walkSwing = pose === 'walk' ? Math.sin(animT / 5) : 0
  const legH = 3.0 * u * legScale
  const bodyW = 6.2 * u * ws
  const bodyH = 3.0 * u
  const hipY = -legH + bob
  const bodyCy = hipY - bodyH / 2
  const legW = 1.1 * u

  // 後ろ足
  ctx.fillStyle = fur
  const legSwing = pose === 'walk' ? walkSwing * u * 0.6 : 0
  ctx.fillRect(-bodyW * 0.32 + legSwing, hipY - legH * 0.05, legW, legH)

  // 前足
  const crouch = pose === 'guard' || pose === 'hit'
  const frontLegH = crouch ? legH * 0.7 : legH
  if (pose === 'punch' || pose === 'kick') {
    ctx.fillRect(bodyW * 0.18, hipY - legH * 0.05, legW, legH * 0.6)
    ctx.save()
    ctx.translate(bodyW * 0.36, hipY - legH * 0.3)
    ctx.rotate(-0.6)
    ctx.fillRect(0, -legW / 2, u * 2.4, legW)
    ctx.restore()
  } else if (pose === 'special') {
    ctx.save()
    ctx.translate(bodyW * 0.3, hipY - frontLegH * 0.2)
    ctx.rotate(-1.3)
    ctx.fillRect(0, -legW / 2, u * 2.2, legW)
    ctx.restore()
  } else {
    ctx.fillRect(bodyW * 0.24 - legSwing, hipY - frontLegH * 0.05, legW, frontLegH)
  }

  // しっぽ
  ctx.strokeStyle = fur
  ctx.lineWidth = u * 0.9
  ctx.lineCap = 'round'
  const tailSway = Math.sin(animT / 8) * u * 0.8
  ctx.beginPath()
  ctx.moveTo(-bodyW * 0.42, bodyCy + bodyH * 0.1)
  ctx.quadraticCurveTo(-bodyW * 0.75, bodyCy - bodyH * 0.6 + tailSway, -bodyW * 0.6, bodyCy - bodyH * 1.3 + tailSway)
  ctx.stroke()

  // 胴体
  ctx.fillStyle = fur
  ctx.beginPath()
  ctx.ellipse(0, bodyCy, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2)
  ctx.fill()

  // お腹の差し色
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.ellipse(bodyW * 0.05, bodyCy + bodyH * 0.25, bodyW * 0.3, bodyH * 0.32, 0, 0, Math.PI * 2)
  ctx.fill()

  // 頭
  const headR = 2.0 * u
  const leanForward = pose === 'punch' || pose === 'kick' ? u * 0.6 : 0
  const headCx = bodyW / 2 + headR * 0.35 + leanForward
  const headCy = bodyCy - bodyH * 0.25 - (pose === 'special' ? u * 0.8 : 0)

  // 耳
  ctx.fillStyle = fur
  ctx.beginPath()
  ctx.moveTo(headCx - headR * 0.7, headCy - headR * 0.6)
  ctx.lineTo(headCx - headR * 0.2, headCy - headR * 1.5)
  ctx.lineTo(headCx + headR * 0.05, headCy - headR * 0.55)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(headCx + headR * 0.15, headCy - headR * 0.65)
  ctx.lineTo(headCx + headR * 0.7, headCy - headR * 1.4)
  ctx.lineTo(headCx + headR * 0.85, headCy - headR * 0.5)
  ctx.fill()

  // 頭部
  ctx.beginPath()
  ctx.arc(headCx, headCy, headR, 0, Math.PI * 2)
  ctx.fill()

  // マズル
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.ellipse(headCx + headR * 0.35, headCy + headR * 0.25, headR * 0.55, headR * 0.4, 0, 0, Math.PI * 2)
  ctx.fill()

  // 目
  if (pose === 'ko') {
    ctx.font = `${u * 1.3}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = '#1c1917'
    ctx.fillText('××', headCx, headCy)
  } else {
    ctx.fillStyle = eye
    const eyeSquint = pose === 'hit' || pose === 'guard'
    const eyeH = eyeSquint ? headR * 0.12 : headR * 0.28
    ctx.beginPath()
    ctx.ellipse(headCx + headR * 0.45, headCy - headR * 0.05, headR * 0.16, eyeH, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(headCx + headR * 0.05, headCy - headR * 0.1, headR * 0.16, eyeH, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // ひげ
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = 1
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath()
    ctx.moveTo(headCx + headR * 0.5, headCy + headR * 0.3 + i * headR * 0.15)
    ctx.lineTo(headCx + headR * 1.5, headCy + headR * 0.2 + i * headR * 0.25)
    ctx.stroke()
  }

  // 口(攻撃時に開く)
  if (pose === 'punch' || pose === 'kick' || pose === 'special') {
    ctx.fillStyle = '#7a2d2d'
    ctx.beginPath()
    ctx.moveTo(headCx + headR * 0.5, headCy + headR * 0.4)
    ctx.lineTo(headCx + headR * 0.75, headCy + headR * 0.55)
    ctx.lineTo(headCx + headR * 0.5, headCy + headR * 0.7)
    ctx.fill()
  }

  ctx.restore()
}
