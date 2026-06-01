import { createFileRoute } from '@tanstack/react-router'
import { type CSSProperties, FormEvent, useEffect, useRef, useState } from 'react'
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

const ACTIONS: UserAction[] = ['poke', 'feed crumb']
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

function intimacyLabel(level: number) {
  if (level < 100) return 'distant'
  if (level < 300) return 'wary'
  if (level < 600) return 'familiar'
  if (level < 900) return 'comfortable'
  return 'trusting'
}

/* ── Themes ──────────────────────────────────────────────────────────────── */
const LT = {
  pageBg:      '#f0ede8',
  ink:         '#2d2926',
  muted:       '#7a6e66',
  softBorder:  '#d4c8be',
  bubbleBg:    '#ffffff',
  pillBg:      '#ffffff',
  inputBg:     '#ffffff',
  logBg:       '#ffffff',
  barBg:       '#e4dcd4',
  barFill:     '#c8964e',
  sendBg:      '#4e7bbf',
  toggleBg:    '#e8e2dc',
  toggleColor: '#7a6e66',
  divider:     '#d4c8be',
}

const DK = {
  pageBg:      '#1c1814',
  ink:         '#e0d8cc',
  muted:       '#9e9080',
  softBorder:  '#3a342c',
  bubbleBg:    '#2a2420',
  pillBg:      '#2a2420',
  inputBg:     '#282218',
  logBg:       '#211d17',
  barBg:       '#3a342c',
  barFill:     '#c8964e',
  sendBg:      '#3a5e8c',
  toggleBg:    '#2a2420',
  toggleColor: '#9e9080',
  divider:     '#3a342c',
}

export const Route = createFileRoute('/')({ component: App })

function App() {
  const [mood, setMood] = useState(INITIAL_MOOD)
  const [activity, setActivity] = useState(INITIAL_ACTIVITY)
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [interactions, setInteractions] = useState<InteractionRecord[]>([])
  const [intimacyLevel, setIntimacyLevel] = useState(() => getIntimacy())
  const [manualIntimacy, setManualIntimacy] = useState(() => String(getIntimacy()))
  const [birdAnim, setBirdAnim] = useState('bird-idle')
  const [showCrumb, setShowCrumb] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  /* Bird position as % of stage dimensions */
  const [birdPos, setBirdPos] = useState({ x: 50, y: 60 })
  const [facingRight, setFacingRight] = useState(true)

  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const roamTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const latestResponse =
    interactions.length > 0 ? interactions[interactions.length - 1].response : null
  const interactionLog = [...interactions].reverse()

  const T = darkMode ? DK : LT

  /* Sync body background so there's no seam outside the root div */
  useEffect(() => {
    document.body.style.background = T.pageBg
    return () => { document.body.style.background = '' }
  }, [T.pageBg])

  useEffect(() => { setIntimacyLevel(getIntimacy()) }, [])
  useEffect(() => { setManualIntimacy(String(intimacyLevel)) }, [intimacyLevel])

  /* Bird reaction animations */
  useEffect(() => {
    if (!latestResponse?.action?.length) return
    const match = latestResponse.action.map((a) => BIRD_ANIM[a]).find(Boolean)
    if (!match) return
    if (animTimer.current) clearTimeout(animTimer.current)
    setBirdAnim(match.cls)
    animTimer.current = setTimeout(() => setBirdAnim('bird-idle'), match.ms)
  }, [latestResponse])

  /* Autonomous roaming — starts after 12 s, repeats every 10–22 s */
  useEffect(() => {
    const scheduleRoam = () => {
      roamTimer.current = setTimeout(() => {
        setBirdPos((prev) => {
          const newX = 12 + Math.random() * 76   // 12 % … 88 %
          const newY = 50 + Math.random() * 22   // 50 % … 72 %
          setFacingRight(newX >= prev.x)
          return { x: newX, y: newY }
        })
        scheduleRoam()
      }, 10000 + Math.random() * 12000)
    }
    roamTimer.current = setTimeout(scheduleRoam, 12000)
    return () => { if (roamTimer.current) clearTimeout(roamTimer.current) }
  }, [])

  const applyDelta = (delta: number) => {
    if (!delta) return
    changeIntimacy(delta)
    setIntimacyLevel((prev) => clampIntimacy(prev + delta))
  }

  async function sendInteraction(intent: InteractionIntent) {
    const trimmed = intent.type === 'chat' ? intent.message.trim() : ''
    if (intent.type === 'chat' && !trimmed) return

    const payload: CrappyBirdInput = {
      action: intent.type === 'action' ? intent.action : DEFAULT_CHAT_ACTION,
      chat: intent.type === 'chat' ? trimmed : '',
      mood,
      activity,
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
      setInteractions((prev) => {
        const id =
          typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`
        const record: InteractionRecord =
          intent.type === 'chat'
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

  const intimPct = (intimacyLevel / INTIMACY_MAX) * 100
  const birdClass = isLoading && birdAnim === 'bird-idle' ? 'bird-loading' : birdAnim
  const bubbleChat =
    isLoading ? '...'
    : latestResponse?.chat?.trim() ? latestResponse.chat
    : '...'

  return (
    <div style={{ minHeight: '100vh', background: T.pageBg, display: 'flex', flexDirection: 'column' }}>

      {/* ── Dark / light toggle ── */}
      <button
        type="button"
        onClick={() => setDarkMode((p) => !p)}
        style={{
          position: 'fixed',
          top: '12px',
          right: '16px',
          zIndex: 100,
          padding: '4px 12px',
          background: T.toggleBg,
          color: T.toggleColor,
          border: `1.5px solid ${T.softBorder}`,
          borderRadius: '20px',
          fontFamily: MONO,
          fontSize: '10px',
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        {darkMode ? 'light' : 'dark'}
      </button>

      {/* ── Bird stage — the bird roams freely in here ── */}
      <div
        style={{
          flex: 1,
          minHeight: '300px',
          position: 'relative',
          overflow: 'visible',
        }}
      >
        {/* Bird unit: smoothly transitions to new positions */}
        <div
          style={{
            position: 'absolute',
            left: `${birdPos.x}%`,
            top: `${birdPos.y}%`,
            transform: 'translate(-50%, -50%)',
            transition: 'left 2.8s ease-in-out, top 2.8s ease-in-out',
            zIndex: 1,
          }}
        >
          {/* Speech bubble — floats just above the bird's head */}
          <div
            style={{
              position: 'absolute',
              bottom: '126px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '180px',
              background: T.bubbleBg,
              border: `2px solid ${T.ink}`,
              borderRadius: '10px',
              padding: '8px 12px',
              textAlign: 'center',
              zIndex: 2,
              boxShadow: darkMode ? 'none' : '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <span style={{ display: 'block', fontFamily: MONO, fontSize: '12px', color: T.ink, lineHeight: 1.6, minHeight: '18px' }}>
              {bubbleChat}
            </span>
            {/* Triangle tail pointing down toward bird head */}
            <div style={{ position: 'absolute', bottom: '-11px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderTop: `11px solid ${T.ink}` }} />
            <div style={{ position: 'absolute', bottom: '-8px',  left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: `9px solid ${T.bubbleBg}` }} />
          </div>

          {/* Horizontal flip wrapper — mirrors bird when walking left */}
          <div style={{ transform: `scaleX(${facingRight ? 1 : -1})`, transition: 'transform 0.4s ease' }}>
            <div style={{ position: 'relative' }}>
              {showCrumb && (
                <div
                  className="crumb-particle"
                  style={{
                    position: 'absolute',
                    bottom: '10px',
                    right: '-10px',
                    width: '9px',
                    height: '7px',
                    background: '#c8964e',
                    borderRadius: '2px',
                    border: '1.5px solid #96681e',
                  }}
                />
              )}
              <img
                src={CrappyBirdFullBody}
                alt="Crappy Bird"
                className={birdClass}
                style={{
                  width: '130px',
                  height: '130px',
                  objectFit: 'contain',
                  transformOrigin: 'center bottom',
                  /*
                   * multiply: white pixels of the PNG become the page background,
                   * black ink stays dark — works in both light and dark mode
                   * as long as pageBg is not pure white / pure black.
                   */
                  mixBlendMode: 'multiply',
                  display: 'block',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div
        style={{
          borderTop: `1px solid ${T.divider}`,
          padding: '20px 16px 56px',
        }}
      >
        <div style={{ maxWidth: '440px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <span style={pill(T)}>mood: {mood}</span>
            <span style={pill(T)}>{activity}</span>
          </div>

          <p style={{ margin: 0, textAlign: 'center', fontFamily: SERIF, fontSize: '13px', color: T.muted, fontStyle: 'italic', lineHeight: 1.75 }}>
            {latestResponse?.reflection ?? 'the air feels still. crappy bird watches quietly.'}
          </p>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                disabled={isLoading}
                onClick={() => void sendInteraction({ type: 'action', action })}
                style={{ ...actionBtn(T), opacity: isLoading ? 0.45 : 1 }}
              >
                {action}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="talk to crappy bird..."
              disabled={isLoading}
              style={chatInput(T)}
            />
            <button
              type="submit"
              disabled={isLoading || !message.trim()}
              style={{ ...sendBtn(T), opacity: isLoading || !message.trim() ? 0.4 : 1 }}
            >
              {isLoading ? '...' : 'say'}
            </button>
          </form>

          {error && (
            <p style={{ margin: 0, fontFamily: MONO, fontSize: '11px', color: '#c0392b', textAlign: 'center' }}>
              {error}
            </p>
          )}

          {interactionLog.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              <div style={{ fontFamily: MONO, fontSize: '10px', color: T.muted, letterSpacing: '2px', textTransform: 'uppercase', paddingBottom: '6px', borderBottom: `1px solid ${T.divider}` }}>
                recent
              </div>
              {interactionLog.map((entry) => (
                <div key={entry.id} style={{ padding: '10px 12px', background: T.logBg, border: `1.5px solid ${T.softBorder}`, borderRadius: '8px', fontFamily: MONO, fontSize: '11px', color: T.ink, lineHeight: 1.7 }}>
                  <div style={{ color: T.muted, marginBottom: '3px' }}>
                    you {entry.type === 'chat' ? `said "${entry.message}"` : `did ${entry.action}`}
                  </div>
                  {entry.response.chat && (
                    <div style={{ marginBottom: '3px' }}>bird: {entry.response.chat}</div>
                  )}
                  <div style={{ color: T.muted, fontStyle: 'italic', fontSize: '10px', marginBottom: '3px' }}>
                    {entry.response.reflection}
                  </div>
                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: entry.response.feeling_delta > 0 ? '#5a8a4a' : entry.response.feeling_delta < 0 ? '#c0392b' : T.muted }}>
                    {entry.response.feeling_delta > 0 ? `+${entry.response.feeling_delta}` : entry.response.feeling_delta} feeling
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Debug */}
          <div style={{ borderTop: `1px solid ${T.divider}`, paddingTop: '12px' }}>
            <button
              type="button"
              onClick={() => setDebugOpen((p) => !p)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: '10px', color: T.muted, letterSpacing: '1.5px', padding: 0, textTransform: 'uppercase' }}
            >
              {debugOpen ? '▲' : '▼'} debug
            </button>

            {debugOpen && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: '11px', color: T.muted }}>
                  <span>intimacy — {intimacyLabel(intimacyLevel)}</span>
                  <span>{intimacyLevel} / {INTIMACY_MAX}</span>
                </div>
                <div style={{ height: '6px', background: T.barBg, borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: T.barFill, borderRadius: '3px', width: `${intimPct}%`, transition: 'width 0.35s ease' }} />
                </div>
                <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontFamily: MONO, fontSize: '11px', color: T.muted }}>set:</label>
                  <input
                    type="number"
                    value={manualIntimacy}
                    onChange={(e) => setManualIntimacy(e.target.value)}
                    min={INTIMACY_MIN}
                    max={INTIMACY_MAX}
                    style={{ width: '72px', padding: '4px 8px', border: `1.5px solid ${T.softBorder}`, borderRadius: '4px', fontFamily: MONO, fontSize: '11px', background: T.inputBg, color: T.ink, outline: 'none' }}
                  />
                  <button type="submit" style={{ padding: '4px 10px', background: T.ink, color: T.pageBg, border: 'none', borderRadius: '4px', fontFamily: MONO, fontSize: '11px', cursor: 'pointer' }}>
                    apply
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIntimacy(INTIMACY_MIN); setIntimacyLevel(INTIMACY_MIN) }}
                    disabled={intimacyLevel === INTIMACY_MIN}
                    style={{ padding: '4px 10px', background: 'transparent', color: T.ink, border: `1.5px solid ${T.softBorder}`, borderRadius: '4px', fontFamily: MONO, fontSize: '11px', cursor: 'pointer', opacity: intimacyLevel === INTIMACY_MIN ? 0.4 : 1 }}
                  >
                    reset
                  </button>
                </form>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

/* ── Style helpers ────────────────────────────────────────────────────────── */

const MONO = '"Courier New", Courier, monospace'
const SERIF = 'Georgia, "Times New Roman", serif'

type Theme = typeof LT

function pill(T: Theme): CSSProperties {
  return {
    padding: '4px 14px',
    background: T.pillBg,
    border: `1.5px solid ${T.ink}`,
    borderRadius: '20px',
    fontFamily: MONO,
    fontSize: '11px',
    color: T.ink,
    boxShadow: `2px 2px 0 ${T.ink}`,
  }
}

function actionBtn(T: Theme): CSSProperties {
  return {
    padding: '9px 22px',
    background: T.ink,
    color: T.pageBg,
    border: 'none',
    borderRadius: '7px',
    fontFamily: MONO,
    fontSize: '12px',
    cursor: 'pointer',
    letterSpacing: '0.4px',
    boxShadow: `2px 2px 0 ${T.muted}`,
    transition: 'opacity 0.15s',
  }
}

function chatInput(T: Theme): CSSProperties {
  return {
    flex: 1,
    padding: '10px 14px',
    border: `2px solid ${T.ink}`,
    borderRadius: '8px',
    background: T.inputBg,
    fontFamily: MONO,
    fontSize: '12px',
    color: T.ink,
    outline: 'none',
  }
}

function sendBtn(T: Theme): CSSProperties {
  return {
    padding: '10px 18px',
    background: T.sendBg,
    color: '#fff',
    border: `2px solid ${T.ink}`,
    borderRadius: '8px',
    fontFamily: MONO,
    fontSize: '12px',
    cursor: 'pointer',
    boxShadow: `2px 2px 0 ${T.ink}`,
    transition: 'opacity 0.15s',
    whiteSpace: 'nowrap',
  }
}
