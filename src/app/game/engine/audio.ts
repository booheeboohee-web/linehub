// WebAudio によるSFX/BGM生成(音声アセット不要)

export type SfxName = 'hit' | 'kick' | 'guard' | 'special' | 'super' | 'ko' | 'select' | 'confirm' | 'status' | 'jump' | 'error'

export class AudioMan {
  private ctx: AudioContext | null = null
  private bgmTimer: number | null = null
  private bgmStep = 0
  muted = false

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      this.ctx = new AC()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** ユーザー操作時に呼んでAudioContextを解錠する */
  unlock() {
    this.ensure()
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
    const ctx = this.ensure()
    if (!ctx || this.muted) return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur)
    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur)
  }

  private noise(dur: number, vol: number, freq = 1200) {
    const ctx = this.ensure()
    if (!ctx || this.muted) return
    const t = ctx.currentTime
    const len = Math.floor(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = freq
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(filter).connect(gain).connect(ctx.destination)
    src.start(t)
  }

  sfx(name: SfxName) {
    switch (name) {
      case 'hit':
        this.noise(0.12, 0.35, 900)
        this.tone(180, 0.1, 'square', 0.15, 90)
        break
      case 'kick':
        this.noise(0.15, 0.4, 600)
        this.tone(130, 0.13, 'square', 0.18, 60)
        break
      case 'guard':
        this.tone(520, 0.08, 'triangle', 0.15, 400)
        break
      case 'special':
        this.tone(300, 0.3, 'sawtooth', 0.2, 900)
        this.noise(0.2, 0.2, 2000)
        break
      case 'super':
        this.tone(200, 0.5, 'sawtooth', 0.25, 1200)
        this.tone(100, 0.5, 'square', 0.2, 50)
        this.noise(0.4, 0.3, 3000)
        break
      case 'ko':
        this.tone(600, 0.8, 'sawtooth', 0.3, 60)
        this.noise(0.5, 0.35, 500)
        break
      case 'select':
        this.tone(660, 0.06, 'square', 0.12)
        break
      case 'confirm':
        this.tone(523, 0.08, 'square', 0.15)
        this.tone(784, 0.15, 'square', 0.15)
        break
      case 'status':
        this.tone(880, 0.2, 'sine', 0.15, 440)
        break
      case 'jump':
        this.tone(240, 0.15, 'sine', 0.12, 480)
        break
      case 'error':
        this.tone(150, 0.15, 'square', 0.15, 100)
        break
    }
  }

  // 簡易チップチューンBGMループ
  startBgm() {
    const ctx = this.ensure()
    if (!ctx || this.bgmTimer !== null) return
    const bass = [110, 110, 147, 147, 131, 131, 98, 98]
    const melody = [440, 0, 523, 440, 587, 523, 440, 392, 440, 0, 523, 587, 659, 587, 523, 440]
    this.bgmStep = 0
    this.bgmTimer = window.setInterval(() => {
      if (this.muted) return
      const s = this.bgmStep
      this.tone(bass[Math.floor(s / 2) % bass.length], 0.18, 'triangle', 0.07)
      const m = melody[s % melody.length]
      if (m > 0) this.tone(m, 0.12, 'square', 0.035)
      if (s % 4 === 0) this.noise(0.05, 0.05, 4000)
      this.bgmStep++
    }, 160)
  }

  stopBgm() {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer)
      this.bgmTimer = null
    }
  }

  destroy() {
    this.stopBgm()
    if (this.ctx) void this.ctx.close()
    this.ctx = null
  }
}
