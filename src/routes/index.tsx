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
  pageBg:    '#f5f2ed',
  ink:       '#2d2926',
  muted:     '#8a7e76',
  border:    '#e0dbd4',
  bubbleBg:  '#ffffff',
  inputBg:   'rgba(255,255,255,0.7)',
  panelBg:   'rgba(255,255,255,0.92)',
  barBg:     '#e4dcd4',
  barFill:   '#c8964e',
}
const DK = {
  pageBg:    '#1a1714',
  ink:       '#e0d8cc',
  muted:     '#7a7068',
  border:    '#2e2924',
  bubbleBg:  '#242018',
  inputBg:   'rgba(36,32,24,0.6)',
  panelBg:   'rgba(26,23,20,0.94)',
  barBg:     '#3a342c',
  barFill:   '#c8964e',
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
  const [panelOpen, setPanelOpen] = useState(false)
  const [showBubble, setShowBubble] = useState(false)
  const [darkMode, setDarkMode]   = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  )
  const [birdPos, setBirdPos]         = useState({ x: 50, y: 55 })
  const [facingRight, setFacingRight] = useState(true)
  const [isRoaming, setIsRoaming]     = useState(false)
  // when false, position changes apply instantly (no glide) — used when the
  // tab is hidden so the bird doesn't violently animate on return
  const [animatePos, setAnimatePos]   = useState(true)

  const animTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const roamTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const roamEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bubbleTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const latestResponse =
    interactions.length > 0 ? interactions[interactions.length - 1].response : null
  const recent = [...interactions].reverse()
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

  /* Speech bubble appears on a new response, fades after 7 s */
  useEffect(() => {
    if (!latestResponse?.chat?.trim()) return
    setShowBubble(true)
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current)
    bubbleTimer.current = setTimeout(() => setShowBubble(false), 7000)
  }, [latestResponse])

  /* Autonomous roaming */
  useEffect(() => {
    const scheduleRoam = () => {
      roamTimer.current = setTimeout(() => {
        const hidden = typeof document !== 'undefined' && document.hidden
        // hidden tab: relocate instantly so it's just "there" on return.
        // visible tab: glide + hop as normal.
        setAnimatePos(!hidden)
        setBirdPos(prev => {
          const newX = 10 + Math.random() * 80
          const newY = 22 + Math.random() * 56
          setFacingRight(newX >= prev.x)
          return { x: newX, y: newY }
        })
        if (!hidden) {
          setIsRoaming(true)
          if (roamEndTimer.current) clearTimeout(roamEndTimer.current)
          roamEndTimer.current = setTimeout(() => setIsRoaming(false), 2800)
        }
        scheduleRoam()
      }, 8000 + Math.random() * 11000)
    }
    roamTimer.current = setTimeout(scheduleRoam, 9000)

    // When the tab is hidden, stop any in-progress hop and disable the glide
    // so nothing animates while we're away (or on the way back).
    const onVisibility = () => {
      if (document.hidden) {
        if (roamEndTimer.current) clearTimeout(roamEndTimer.current)
        setIsRoaming(false)
        setAnimatePos(false)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (roamTimer.current)    clearTimeout(roamTimer.current)
      if (roamEndTimer.current) clearTimeout(roamEndTimer.current)
      document.removeEventListener('visibilitychange', onVisibility)
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
  const birdClass = isLoading && birdAnim === 'bird-idle' ? 'bird-loading' : birdAnim
  const intimPct  = (intimacyLevel / INTIMACY_MAX) * 100
  const dots      = intimacyToDots(intimacyLevel)
  const bubbleChat = latestResponse?.chat?.trim() ?? ''

  return (
    <div className="app-shell" style={{ position: 'relative', overflow: 'hidden', background: T.pageBg, color: T.ink }}>

      {/* ── Top-left: minimal status ── */}
      <div style={{ position: 'absolute', top: '16px', left: '18px', zIndex: 5, display: 'flex', flexDirection: 'column', gap: '4px', pointerEvents: 'none' }}>
        <span style={{ fontFamily: MONO, fontSize: '11px', color: T.ink }}>{mood}</span>
        <span style={{ fontFamily: MONO, fontSize: '10px', color: T.muted }}>{activity}</span>
        <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', background: dots >= i ? T.ink : T.border, transition: 'background 0.4s ease' }} />
          ))}
        </div>
      </div>

      {/* ── Top-right: history / debug toggle ── */}
      <button
        type="button"
        onClick={() => setPanelOpen(o => !o)}
        style={{ position: 'absolute', top: '14px', right: '16px', zIndex: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: T.muted, padding: '6px' }}
      >
        {panelOpen ? '✕' : '···'}
      </button>

      {/* ── Slide-down minimal panel: recent history + debug ── */}
      {panelOpen && (
        <div style={{ position: 'absolute', top: '40px', right: '16px', zIndex: 6, width: 'min(86vw, 320px)', maxHeight: '70vh', overflowY: 'auto', background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '14px', backdropFilter: 'blur(6px)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          <div style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', color: T.muted, marginBottom: '10px' }}>recent</div>

          {recent.length === 0 ? (
            <p style={{ margin: 0, fontFamily: SERIF, fontStyle: 'italic', fontSize: '12px', color: T.muted }}>nothing yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recent.slice(0, 20).map(e => (
                <div key={e.id} style={{ fontFamily: MONO, fontSize: '11px', lineHeight: 1.5 }}>
                  <span style={{ color: T.muted }}>
                    {e.type === 'chat' ? `you: ${e.message}` : `· ${e.action} ·`}
                  </span>
                  {e.response.chat ? <div style={{ color: T.ink }}>{e.response.chat}</div> : null}
                </div>
              ))}
            </div>
          )}

          {/* Debug (kept for testing) */}
          <div style={{ borderTop: `1px solid ${T.border}`, marginTop: '14px', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: '10px', color: T.muted }}>
              <span>intimacy — {intimacyLabel(intimacyLevel)}</span>
              <span>{intimacyLevel}/{INTIMACY_MAX}</span>
            </div>
            <div style={{ height: '4px', background: T.barBg, borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${intimPct}%`, background: T.barFill, borderRadius: '2px', transition: 'width 0.35s ease' }} />
            </div>
            <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="number"
                value={manualIntimacy}
                onChange={e => setManualIntimacy(e.target.value)}
                min={INTIMACY_MIN}
                max={INTIMACY_MAX}
                style={{ width: '76px', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: '6px', fontFamily: MONO, fontSize: '12px', background: T.bubbleBg, color: T.ink, outline: 'none' }}
              />
              <button type="submit" style={{ padding: '6px 12px', background: T.ink, color: T.pageBg, border: 'none', borderRadius: '6px', fontFamily: MONO, fontSize: '11px', cursor: 'pointer' }}>set</button>
              <button
                type="button"
                onClick={() => { setIntimacy(INTIMACY_MIN); setIntimacyLevel(INTIMACY_MIN) }}
                disabled={intimacyLevel === INTIMACY_MIN}
                style={{ padding: '6px 12px', background: 'transparent', color: T.ink, border: `1px solid ${T.border}`, borderRadius: '6px', fontFamily: MONO, fontSize: '11px', cursor: 'pointer', opacity: intimacyLevel === INTIMACY_MIN ? 0.4 : 1 }}
              >
                reset
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── The playground: bird roams the whole page ── */}
      <div
        style={{ position: 'absolute', left: `${birdPos.x}%`, top: `${birdPos.y}%`, transform: 'translate(-50%, -50%)', transition: animatePos ? 'left 2.8s ease-in-out, top 2.8s ease-in-out' : 'none', zIndex: 2 }}
      >
        {/* Speech bubble — follows the bird, floats above its head, fades out */}
        <div
          style={{
            position: 'absolute',
            bottom: '128px',
            left: '50%',
            width: '170px',
            background: T.bubbleBg,
            border: `2px solid ${T.ink}`,
            borderRadius: '12px',
            padding: '8px 12px',
            textAlign: 'center',
            opacity: showBubble && bubbleChat ? 1 : 0,
            transform: `translateX(-50%) translateY(${showBubble ? 0 : 6}px)`,
            transition: 'opacity 0.4s ease, transform 0.4s ease',
            pointerEvents: 'none',
          }}
        >
          <span style={{ display: 'block', fontFamily: MONO, fontSize: '12px', color: T.ink, lineHeight: 1.5 }}>
            {bubbleChat || '...'}
          </span>
          <div style={{ position: 'absolute', bottom: '-11px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderTop: `11px solid ${T.ink}` }} />
          <div style={{ position: 'absolute', bottom: '-8px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: `9px solid ${T.bubbleBg}` }} />
        </div>

        {/* Hop wrapper */}
        <div className={isRoaming ? 'bird-hop' : ''} style={{ transformOrigin: 'center bottom' }}>
          {/* Flip wrapper — mirrors bird by travel direction */}
          <div style={{ transform: `scaleX(${facingRight ? 1 : -1})`, transition: 'transform 0.4s ease' }}>
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
                draggable={false}
                style={{ width: '120px', height: '120px', objectFit: 'contain', transformOrigin: 'center bottom', filter: darkMode ? 'invert(1)' : 'none', display: 'block', userSelect: 'none' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Current reflection — subtle narrator line above the input ── */}
      {latestResponse?.reflection && (
        <p style={{ position: 'absolute', bottom: '74px', left: '50%', transform: 'translateX(-50%)', width: 'min(90vw, 460px)', margin: 0, textAlign: 'center', fontFamily: SERIF, fontStyle: 'italic', fontSize: '12px', color: T.muted, lineHeight: 1.6, zIndex: 3, pointerEvents: 'none' }}>
          {latestResponse.reflection}
        </p>
      )}

      {error && (
        <p style={{ position: 'absolute', bottom: '74px', left: '50%', transform: 'translateX(-50%)', margin: 0, fontFamily: MONO, fontSize: '11px', color: '#c0392b', zIndex: 3 }}>
          {error}
        </p>
      )}

      {/* ── Minimal input: crumb + say ── */}
      <div className="input-bar" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 4, display: 'flex', justifyContent: 'center', padding: '0 16px 14px', paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: 'min(94vw, 420px)' }}>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => { if (!isLoading) void sendInteraction({ type: 'action', action: 'feed crumb' }) }}
            title="feed a crumb"
            style={{ flexShrink: 0, width: '44px', height: '44px', borderRadius: '50%', background: T.inputBg, border: `1px solid ${T.border}`, fontFamily: MONO, fontSize: '15px', color: T.ink, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.4 : 1, backdropFilter: 'blur(6px)' }}
          >
            ·
          </button>
          <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex' }}>
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={isLoading ? 'crappy bird is thinking...' : 'say something, or tap the bird...'}
              disabled={isLoading}
              style={{ flex: 1, minWidth: 0, height: '44px', padding: '0 16px', border: `1px solid ${T.border}`, borderRadius: '22px', background: T.inputBg, fontFamily: MONO, fontSize: '16px', color: T.ink, outline: 'none', backdropFilter: 'blur(6px)' }}
            />
          </form>
        </div>
      </div>
    </div>
  )
}
