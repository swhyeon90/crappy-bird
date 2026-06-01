import { createFileRoute } from '@tanstack/react-router'
import { FormEvent, useEffect, useRef, useState } from 'react'
import {
  type CrappyBirdInput,
  type CrappyBirdResponse,
  type UserAction,
  INITIAL_ACTIVITY,
  INITIAL_MOOD,
  INTIMACY_MAX,
  INTIMACY_MIN,
  changeIntimacy,
  getIntimacy,
  setIntimacy,
} from '../lib/crappyBird'
import CrappyBirdFullBody from '../resources/images/full-body-temp.png'

type InteractionRecord =
  | { id: string; type: 'chat'; message: string; response: CrappyBirdResponse }
  | { id: string; type: 'action'; action: UserAction; response: CrappyBirdResponse }

type InteractionIntent =
  | { type: 'chat'; message: string }
  | { type: 'action'; action: UserAction }

const DEFAULT_CHAT_ACTION: UserAction = 'none'
const clampIntimacy = (v: number) => Math.min(INTIMACY_MAX, Math.max(INTIMACY_MIN, v))

const BIRD_ANIM: Partial<Record<string, { cls: string; ms: number }>> = {
  blink:       { cls: 'bird-blink',       ms: 600  },
  flinch:      { cls: 'bird-flinch',      ms: 700  },
  tilt_head:   { cls: 'bird-tilt',        ms: 1000 },
  peck:        { cls: 'bird-peck',        ms: 900  },
  shift:       { cls: 'bird-shift',       ms: 800  },
  look_away:   { cls: 'bird-shift',       ms: 800  },
  step_back:   { cls: 'bird-step-back',   ms: 900  },
  lean_closer: { cls: 'bird-lean',        ms: 1100 },
  settle_down: { cls: 'bird-settle',      ms: 1100 },
  peck_gently: { cls: 'bird-peck-gentle', ms: 1300 },
}

function intimacyToDots(level: number) {
  if (level < 100) return 1
  if (level < 300) return 2
  if (level < 600) return 3
  if (level < 900) return 4
  return 5
}

function intimacyLabel(level: number) {
  if (level < 100) return 'distant'
  if (level < 300) return 'wary'
  if (level < 600) return 'familiar'
  if (level < 900) return 'comfortable'
  return 'trusting'
}

/* ── Themes ───────────────────────────────────────────────────────────────── */
const LT = {
  pageBg:     '#f5f2ed',
  ink:        '#2d2926',
  muted:      '#8a7e76',
  border:     '#e0dbd4',
  bubbleBg:   '#ffffff',
  inputBg:    '#ffffff',
  barBg:      '#e4dcd4',
  barFill:    '#c8964e',
  divider:    '#ebe6e0',
}
const DK = {
  pageBg:     '#1a1714',
  ink:        '#e0d8cc',
  muted:      '#7a7068',
  border:     '#2e2924',
  bubbleBg:   '#242018',
  inputBg:    '#242018',
  barBg:      '#3a342c',
  barFill:    '#c8964e',
  divider:    '#242018',
}

const MONO = '"Courier New", Courier, monospace'
const SERIF = 'Georgia, "Times New Roman", serif'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const [mood, setMood]           = useState(INITIAL_MOOD)
  const [activity, setActivity]   = useState(INITIAL_ACTIVITY)
  const [message, setMessage]     = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [interactions, setInteractions] = useState<InteractionRecord[]>([])
  const [intimacyLevel, setIntimacyLevel] = useState(() => getIntimacy())
  const [manualIntimacy, setManualIntimacy] = useState(() => String(getIntimacy()))
  const [birdAnim, setBirdAnim]   = useState('bird-idle')
  const [showCrumb, setShowCrumb] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)
  const [darkMode, setDarkMode]   = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  )
  const [birdPos, setBirdPos]         = useState({ x: 50, y: 60 })
  const [facingRight, setFacingRight] = useState(true)
  const [isRoaming, setIsRoaming]     = useState(false)

  const animTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const roamTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const roamEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chatEndRef   = useRef<HTMLDivElement>(null)

  const latestResponse =
    interactions.length > 0 ? interactions[interactions.length - 1].response : null
  const T = darkMode ? DK : LT

  /* System dark-mode tracking */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setDarkMode(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    document.body.style.background = T.pageBg
    return () => { document.body.style.background = '' }
  }, [T.pageBg])

  useEffect(() => { setIntimacyLevel(getIntimacy()) }, [])
  useEffect(() => { setManualIntimacy(String(intimacyLevel)) }, [intimacyLevel])

  /* Bird reaction animation */
  useEffect(() => {
    if (!latestResponse?.action?.length) return
    const match = latestResponse.action.map(a => BIRD_ANIM[a]).find(Boolean)
    if (!match) return
    if (animTimer.current) clearTimeout(animTimer.current)
    setBirdAnim(match.cls)
    animTimer.current = setTimeout(() => setBirdAnim('bird-idle'), match.ms)
  }, [latestResponse])

  /* Auto-scroll chat to bottom */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [interactions, isLoading])

  /* Autonomous roaming */
  useEffect(() => {
    const scheduleRoam = () => {
      roamTimer.current = setTimeout(() => {
        setBirdPos(prev => {
          const newX = 12 + Math.random() * 76
          const newY = 45 + Math.random() * 30
          setFacingRight(newX >= prev.x)
          return { x: newX, y: newY }
        })
        setIsRoaming(true)
        if (roamEndTimer.current) clearTimeout(roamEndTimer.current)
        roamEndTimer.current = setTimeout(() => setIsRoaming(false), 2800)
        scheduleRoam()
      }, 10000 + Math.random() * 12000)
    }
    roamTimer.current = setTimeout(scheduleRoam, 12000)
    return () => {
      if (roamTimer.current)    clearTimeout(roamTimer.current)
      if (roamEndTimer.current) clearTimeout(roamEndTimer.current)
    }
  }, [])

  const applyDelta = (delta: number) => {
    if (!delta) return
    changeIntimacy(delta)
    setIntimacyLevel(prev => clampIntimacy(prev + delta))
  }

  async function sendInteraction(intent: InteractionIntent) {
    const trimmed = intent.type === 'chat' ? intent.message.trim() : ''
    if (intent.type === 'chat' && !trimmed) return

    const payload: CrappyBirdInput = {
      action: intent.type === 'action' ? intent.action : DEFAULT_CHAT_ACTION,
      chat:   intent.type === 'chat'   ? trimmed : '',
      mood, activity,
      last_reflection: latestResponse?.reflection ?? '',
      intimacy: intimacyLevel,
    }

    if (intent.type === 'action' && intent.action === 'feed crumb') {
      setShowCrumb(true)
      setTimeout(() => setShowCrumb(false), 2500)
    }

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/crappy-bird', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('crappy bird is feeling too frazzled to reply.')
      const data = (await res.json()) as CrappyBirdResponse
      setMood(data.mood)
      setActivity(data.activity)
      setInteractions(prev => {
        const id = typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`
        const record: InteractionRecord = intent.type === 'chat'
          ? { id, type: 'chat', message: trimmed, response: data }
          : { id, type: 'action', action: intent.action, response: data }
        return [...prev, record]
      })
      if (intent.type === 'chat') setMessage('')
      if (Number.isFinite(data.feeling_delta)) applyDelta(Math.round(data.feeling_delta))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to reach crappy bird.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleManualSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const n = Number(manualIntimacy)
    if (!Number.isFinite(n)) return
    const c = clampIntimacy(n)
    setIntimacy(c)
    setIntimacyLevel(c)
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isLoading) return
    void sendInteraction({ type: 'chat', message })
  }

  const poke = () => { if (!isLoading) void sendInteraction({ type: 'action', action: 'poke' }) }
  const birdClass  = isLoading && birdAnim === 'bird-idle' ? 'bird-loading' : birdAnim
  const intimPct   = (intimacyLevel / INTIMACY_MAX) * 100
  const dots       = intimacyToDots(intimacyLevel)

  return (
    <div className="app-shell" style={{ background: T.pageBg, display: 'flex', flexDirection: 'column', color: T.ink, overflow: 'hidden' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: `1px solid ${T.divider}` }}>
        <span style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase', color: T.muted }}>
          crappy bird
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontFamily: MONO, fontSize: '10px', color: T.muted, textTransform: 'lowercase' }}>
            {mood}
          </span>
          {/* Intimacy dots */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', background: dots >= i ? T.ink : T.border, transition: 'background 0.4s ease' }} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Bird stage ──────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, height: '40vh', minHeight: '180px', maxHeight: '300px', position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${T.divider}` }}>

        {/* Roaming bird */}
        <div style={{ position: 'absolute', left: `${birdPos.x}%`, top: `${birdPos.y}%`, transform: 'translate(-50%, -50%)', transition: 'left 2.8s ease-in-out, top 2.8s ease-in-out', zIndex: 1 }}>
          <div className={isRoaming ? 'bird-hop' : ''} style={{ transformOrigin: 'center bottom' }}>
            <div style={{ transform: `scaleX(${facingRight ? 1 : -1})`, transition: 'transform 0.4s ease' }}>
              {/* Clickable bird */}
              <div
                role="button"
                aria-label="poke crappy bird"
                tabIndex={0}
                onClick={poke}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke() } }}
                style={{ position: 'relative', cursor: isLoading ? 'default' : 'pointer', display: 'inline-block' }}
              >
                {showCrumb && (
                  <div className="crumb-particle" style={{ position: 'absolute', bottom: '10px', right: '-10px', width: '9px', height: '7px', background: '#c8964e', borderRadius: '2px', border: '1.5px solid #96681e' }} />
                )}
                <img
                  src={CrappyBirdFullBody}
                  alt="Crappy Bird"
                  className={birdClass}
                  style={{ width: '120px', height: '120px', objectFit: 'contain', transformOrigin: 'center bottom', filter: darkMode ? 'invert(1)' : 'none', display: 'block' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Activity strip inside stage — bottom edge */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: MONO, fontSize: '9px', color: T.muted, letterSpacing: '1px', textTransform: 'lowercase', opacity: 0.8 }}>
            {activity}
          </span>
          {interactions.length === 0 && (
            <span style={{ fontFamily: MONO, fontSize: '9px', color: T.muted, letterSpacing: '1px', opacity: 0.6 }}>
              tap to poke
            </span>
          )}
        </div>
      </div>

      {/* ── Chat log ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, padding: '20px 16px 12px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* Empty state */}
          {interactions.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60px' }}>
              <p style={{ margin: 0, fontFamily: SERIF, fontSize: '13px', color: T.muted, fontStyle: 'italic', textAlign: 'center', lineHeight: 1.8 }}>
                the air feels still.<br />crappy bird watches quietly.
              </p>
            </div>
          )}

          {/* Conversation entries */}
          {interactions.map(entry => (
            <div key={entry.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>

              {/* Your turn — right-aligned */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ maxWidth: '72%', padding: '9px 14px', borderRadius: entry.type === 'chat' ? '18px 18px 5px 18px' : '20px', background: T.ink, color: T.pageBg, fontFamily: MONO, fontSize: '12px', lineHeight: 1.55, wordBreak: 'break-word' }}>
                  {entry.type === 'chat' ? entry.message : entry.action}
                </div>
              </div>

              {/* Bird's response — left-aligned */}
              {entry.response.chat ? (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ maxWidth: '72%', padding: '9px 14px', borderRadius: '18px 18px 18px 5px', background: T.bubbleBg, border: `1px solid ${T.border}`, fontFamily: MONO, fontSize: '12px', color: T.ink, lineHeight: 1.55, wordBreak: 'break-word' }}>
                    {entry.response.chat}
                  </div>
                </div>
              ) : null}

              {/* Narrator reflection — centered italic */}
              {entry.response.reflection ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 16px' }}>
                  <span style={{ fontFamily: SERIF, fontSize: '11px', color: T.muted, fontStyle: 'italic', textAlign: 'center', lineHeight: 1.7 }}>
                    {entry.response.reflection}
                  </span>
                </div>
              ) : null}
            </div>
          ))}

          {/* Typing indicator while waiting */}
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ padding: '9px 16px', borderRadius: '18px 18px 18px 5px', background: T.bubbleBg, border: `1px solid ${T.border}`, fontFamily: MONO, fontSize: '13px', color: T.muted, letterSpacing: '3px' }}>
                ...
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p style={{ margin: 0, fontFamily: MONO, fontSize: '11px', color: '#c0392b', textAlign: 'center' }}>
              {error}
            </p>
          )}

          {/* Debug */}
          <div style={{ borderTop: `1px solid ${T.divider}`, paddingTop: '14px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={() => setDebugOpen(p => !p)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: '9px', color: T.muted, letterSpacing: '2px', padding: 0, textTransform: 'uppercase', opacity: 0.7 }}
            >
              {debugOpen ? '▲' : '▼'} debug
            </button>
            {debugOpen && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: '10px', color: T.muted }}>
                  <span>intimacy — {intimacyLabel(intimacyLevel)}</span>
                  <span>{intimacyLevel} / {INTIMACY_MAX}</span>
                </div>
                <div style={{ height: '4px', background: T.barBg, borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: T.barFill, width: `${intimPct}%`, borderRadius: '2px', transition: 'width 0.35s ease' }} />
                </div>
                <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontFamily: MONO, fontSize: '10px', color: T.muted }}>set:</label>
                  <input
                    type="number"
                    value={manualIntimacy}
                    onChange={e => setManualIntimacy(e.target.value)}
                    min={INTIMACY_MIN}
                    max={INTIMACY_MAX}
                    style={{ width: '70px', padding: '4px 8px', border: `1px solid ${T.border}`, borderRadius: '4px', fontFamily: MONO, fontSize: '10px', background: T.inputBg, color: T.ink, outline: 'none' }}
                  />
                  <button type="submit" style={{ padding: '4px 10px', background: T.ink, color: T.pageBg, border: 'none', borderRadius: '4px', fontFamily: MONO, fontSize: '10px', cursor: 'pointer' }}>apply</button>
                  <button
                    type="button"
                    onClick={() => { setIntimacy(INTIMACY_MIN); setIntimacyLevel(INTIMACY_MIN) }}
                    disabled={intimacyLevel === INTIMACY_MIN}
                    style={{ padding: '4px 10px', background: 'transparent', color: T.ink, border: `1px solid ${T.border}`, borderRadius: '4px', fontFamily: MONO, fontSize: '10px', cursor: 'pointer', opacity: intimacyLevel === INTIMACY_MIN ? 0.4 : 1 }}
                  >
                    reset
                  </button>
                </form>
              </div>
            )}
          </div>

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* ── Input bar ───────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${T.divider}`, padding: '10px 12px', display: 'flex', gap: '8px', alignItems: 'center', background: T.pageBg }}>
        {/* Feed crumb */}
        <button
          type="button"
          disabled={isLoading}
          onClick={() => { if (!isLoading) void sendInteraction({ type: 'action', action: 'feed crumb' }) }}
          style={{ flexShrink: 0, padding: '8px 12px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: '20px', fontFamily: MONO, fontSize: '10px', color: T.muted, cursor: isLoading ? 'not-allowed' : 'pointer', letterSpacing: '0.5px', opacity: isLoading ? 0.4 : 1, transition: 'opacity 0.15s' }}
        >
          crumb
        </button>

        {/* Message input + send */}
        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="say something..."
            disabled={isLoading}
            style={{ flex: 1, minWidth: 0, padding: '8px 14px', border: `1px solid ${T.border}`, borderRadius: '20px', background: T.inputBg, fontFamily: MONO, fontSize: '13px', color: T.ink, outline: 'none' }}
          />
          <button
            type="submit"
            disabled={isLoading || !message.trim()}
            aria-label="send"
            style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '50%', background: isLoading || !message.trim() ? T.border : T.ink, color: isLoading || !message.trim() ? T.muted : T.pageBg, border: 'none', cursor: isLoading || !message.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', transition: 'background 0.2s ease' }}
          >
            ↑
          </button>
        </form>
      </div>
    </div>
  )
}
