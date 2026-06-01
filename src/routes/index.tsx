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
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const latestResponse =
    interactions.length > 0 ? interactions[interactions.length - 1].response : null
  const interactionLog = [...interactions].reverse()

  useEffect(() => { setIntimacyLevel(getIntimacy()) }, [])
  useEffect(() => { setManualIntimacy(String(intimacyLevel)) }, [intimacyLevel])

  useEffect(() => {
    if (!latestResponse?.action?.length) return
    const match = latestResponse.action.map((a) => BIRD_ANIM[a]).find(Boolean)
    if (!match) return
    if (animTimer.current) clearTimeout(animTimer.current)
    setBirdAnim(match.cls)
    animTimer.current = setTimeout(() => setBirdAnim('bird-idle'), match.ms)
  }, [latestResponse])

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

  const bubbleChat = isLoading
    ? '...'
    : latestResponse?.chat?.trim()
      ? latestResponse.chat
      : '...'

  return (
    <div style={S.page}>

      {/* ── Sky environment ── */}
      <div style={S.sky}>

        {/* Speech bubble — floats in upper sky, centered above the bird */}
        <div style={S.bubble}>
          <span style={S.bubbleText}>{bubbleChat}</span>
          <div style={S.tailOuter} />
          <div style={S.tailInner} />
        </div>

        {/* Bird anchored to the ground line */}
        <div style={S.birdAnchor}>
          <div style={{ position: 'relative' }}>
            {showCrumb && <div className="crumb-particle" style={S.crumb} />}
            <img
              src={CrappyBirdFullBody}
              alt="Crappy Bird"
              className={birdClass}
              style={S.bird}
            />
          </div>
        </div>
      </div>

      {/* ── Ground strip ── */}
      <div style={S.ground}>
        <div style={S.tuft1} />
        <div style={S.tuft2} />
        <div style={S.tuft3} />
        <div style={S.tuft4} />
        <div style={S.tuft5} />
        <div style={S.tuft6} />
      </div>

      {/* ── Controls ── */}
      <div style={S.controls}>

        <div style={S.pillRow}>
          <span style={S.pill}>mood: {mood}</span>
          <span style={S.pill}>{activity}</span>
        </div>

        <p style={S.reflection}>
          {latestResponse?.reflection ?? 'the air feels still. crappy bird watches quietly.'}
        </p>

        <div style={S.actionsRow}>
          {ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              disabled={isLoading}
              onClick={() => void sendInteraction({ type: 'action', action })}
              style={{ ...S.btn, opacity: isLoading ? 0.45 : 1 }}
            >
              {action}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={S.chatForm}>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="talk to crappy bird..."
            disabled={isLoading}
            style={S.chatInput}
          />
          <button
            type="submit"
            disabled={isLoading || !message.trim()}
            style={{ ...S.sendBtn, opacity: isLoading || !message.trim() ? 0.4 : 1 }}
          >
            {isLoading ? '...' : 'say'}
          </button>
        </form>

        {error && <p style={S.errorText}>{error}</p>}

        {interactionLog.length > 0 && (
          <div style={S.log}>
            <div style={S.logHeader}>recent</div>
            {interactionLog.map((entry) => (
              <div key={entry.id} style={S.logEntry}>
                <div style={S.logYou}>
                  you{' '}
                  {entry.type === 'chat'
                    ? `said "${entry.message}"`
                    : `did ${entry.action}`}
                </div>
                {entry.response.chat && (
                  <div style={S.logBird}>bird: {entry.response.chat}</div>
                )}
                <div style={S.logReflection}>{entry.response.reflection}</div>
                <div
                  style={{
                    ...S.logDelta,
                    color:
                      entry.response.feeling_delta > 0
                        ? '#5a8a4a'
                        : entry.response.feeling_delta < 0
                          ? '#c0392b'
                          : '#9e8e84',
                  }}
                >
                  {entry.response.feeling_delta > 0
                    ? `+${entry.response.feeling_delta}`
                    : entry.response.feeling_delta}{' '}
                  feeling
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Debug panel */}
        <div style={S.debugSection}>
          <button
            type="button"
            onClick={() => setDebugOpen((p) => !p)}
            style={S.debugToggle}
          >
            {debugOpen ? '▲' : '▼'} debug
          </button>

          {debugOpen && (
            <div style={S.debugPanel}>
              <div style={S.intimacyRow}>
                <span>intimacy — {intimacyLabel(intimacyLevel)}</span>
                <span>{intimacyLevel} / {INTIMACY_MAX}</span>
              </div>
              <div style={S.bar}>
                <div style={{ ...S.barFill, width: `${intimPct}%` }} />
              </div>
              <form onSubmit={handleManualSubmit} style={S.debugForm}>
                <label style={S.debugLabel}>set:</label>
                <input
                  type="number"
                  value={manualIntimacy}
                  onChange={(e) => setManualIntimacy(e.target.value)}
                  min={INTIMACY_MIN}
                  max={INTIMACY_MAX}
                  style={S.debugInput}
                />
                <button type="submit" style={S.debugApply}>apply</button>
                <button
                  type="button"
                  onClick={() => { setIntimacy(INTIMACY_MIN); setIntimacyLevel(INTIMACY_MIN) }}
                  disabled={intimacyLevel === INTIMACY_MIN}
                  style={{ ...S.debugReset, opacity: intimacyLevel === INTIMACY_MIN ? 0.4 : 1 }}
                >
                  reset
                </button>
              </form>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

/* ── Styles ───────────────────────────────────────────────────────────────── */

const MONO = '"Courier New", Courier, monospace'
const SERIF = 'Georgia, "Times New Roman", serif'
const INK = '#2d2926'
const MUTED = '#7a6e66'
const SOFT_BORDER = '#d4c8be'

const S: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f0ede8',
    display: 'flex',
    flexDirection: 'column',
  },

  /* Full-width sky — no frame, no border, bird lives here */
  sky: {
    background: 'linear-gradient(180deg, #c0d8ee 0%, #d4eaf8 40%, #eaf4ff 72%, #f5f0e4 100%)',
    minHeight: '280px',
    height: '38vh',
    maxHeight: '420px',
    position: 'relative',
    overflow: 'hidden',
  },

  /* Centered speech bubble, floats in upper half of sky */
  bubble: {
    position: 'absolute',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '220px',
    background: 'white',
    border: `2px solid ${INK}`,
    borderRadius: '10px',
    padding: '10px 14px',
    textAlign: 'center',
    zIndex: 2,
  },
  bubbleText: {
    display: 'block',
    fontFamily: MONO,
    fontSize: '12px',
    color: INK,
    lineHeight: '1.65',
    minHeight: '18px',
  },
  /* Triangle tail points down toward bird */
  tailOuter: {
    position: 'absolute',
    bottom: '-11px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderLeft: '9px solid transparent',
    borderRight: '9px solid transparent',
    borderTop: `11px solid ${INK}`,
  },
  tailInner: {
    position: 'absolute',
    bottom: '-8px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderLeft: '8px solid transparent',
    borderRight: '8px solid transparent',
    borderTop: '9px solid white',
  },

  /* Bird sits right at the bottom edge of the sky (the ground line) */
  birdAnchor: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1,
  },
  crumb: {
    position: 'absolute',
    bottom: '12px',
    right: '-10px',
    width: '9px',
    height: '7px',
    background: '#c8964e',
    borderRadius: '2px',
    border: '1.5px solid #96681e',
  },
  bird: {
    width: '130px',
    height: '130px',
    objectFit: 'contain',
    /* pivot rotations around the feet (bottom of image) */
    transformOrigin: 'center bottom',
    /* blend white PNG background into the sky */
    mixBlendMode: 'multiply',
    display: 'block',
  },

  /* Ground strip — full viewport width, no border, connects to sky naturally */
  ground: {
    background: 'linear-gradient(180deg, #c4dc96 0%, #a8c46c 100%)',
    height: '56px',
    borderTop: `2.5px solid ${INK}`,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingTop: '8px',
    gap: '8px',
  },
  tuft1: { width: '7px',  height: '5px',  background: '#7ca040', borderRadius: '60% 60% 0 0', border: `1.5px solid ${INK}` },
  tuft2: { width: '13px', height: '9px',  background: '#7ca040', borderRadius: '60% 60% 0 0', border: `1.5px solid ${INK}` },
  tuft3: { width: '9px',  height: '6px',  background: '#7ca040', borderRadius: '60% 60% 0 0', border: `1.5px solid ${INK}` },
  tuft4: { width: '14px', height: '10px', background: '#7ca040', borderRadius: '60% 60% 0 0', border: `1.5px solid ${INK}` },
  tuft5: { width: '10px', height: '7px',  background: '#7ca040', borderRadius: '60% 60% 0 0', border: `1.5px solid ${INK}` },
  tuft6: { width: '8px',  height: '5px',  background: '#7ca040', borderRadius: '60% 60% 0 0', border: `1.5px solid ${INK}` },

  /* Controls: centered, warm off-white (matches page background) */
  controls: {
    maxWidth: '440px',
    width: '100%',
    margin: '0 auto',
    padding: '24px 16px 56px',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },

  pillRow: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  pill: {
    padding: '4px 14px',
    background: 'white',
    border: `1.5px solid ${INK}`,
    borderRadius: '20px',
    fontFamily: MONO,
    fontSize: '11px',
    color: INK,
    boxShadow: `2px 2px 0 ${INK}`,
  },
  reflection: {
    margin: 0,
    textAlign: 'center',
    fontFamily: SERIF,
    fontSize: '13px',
    color: MUTED,
    fontStyle: 'italic',
    lineHeight: '1.75',
  },

  actionsRow: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  btn: {
    padding: '9px 22px',
    background: INK,
    color: 'white',
    border: 'none',
    borderRadius: '7px',
    fontFamily: MONO,
    fontSize: '12px',
    cursor: 'pointer',
    letterSpacing: '0.4px',
    boxShadow: '2px 2px 0 #6b5d52',
    transition: 'opacity 0.15s',
  },

  chatForm: { display: 'flex', gap: '8px' },
  chatInput: {
    flex: 1,
    padding: '10px 14px',
    border: `2px solid ${INK}`,
    borderRadius: '8px',
    background: 'white',
    fontFamily: MONO,
    fontSize: '12px',
    color: INK,
    outline: 'none',
  },
  sendBtn: {
    padding: '10px 18px',
    background: '#4e7bbf',
    color: 'white',
    border: `2px solid ${INK}`,
    borderRadius: '8px',
    fontFamily: MONO,
    fontSize: '12px',
    cursor: 'pointer',
    boxShadow: `2px 2px 0 ${INK}`,
    transition: 'opacity 0.15s',
    whiteSpace: 'nowrap',
  },
  errorText: {
    margin: 0,
    fontFamily: MONO,
    fontSize: '11px',
    color: '#c0392b',
    textAlign: 'center',
  },

  log: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '340px',
    overflowY: 'auto',
  },
  logHeader: {
    fontFamily: MONO,
    fontSize: '10px',
    color: '#9e8e84',
    letterSpacing: '2.5px',
    textTransform: 'uppercase',
    paddingBottom: '6px',
    borderBottom: `1px solid ${SOFT_BORDER}`,
  },
  logEntry: {
    padding: '10px 12px',
    background: 'white',
    border: `1.5px solid ${SOFT_BORDER}`,
    borderRadius: '8px',
    fontFamily: MONO,
    fontSize: '11px',
    color: INK,
    lineHeight: '1.7',
  },
  logYou:        { color: MUTED, marginBottom: '3px' },
  logBird:       { marginBottom: '3px' },
  logReflection: { color: '#9e8e84', fontStyle: 'italic', fontSize: '10px', marginBottom: '3px' },
  logDelta:      { fontSize: '10px', fontWeight: 'bold' },

  debugSection: {
    borderTop: `1px solid ${SOFT_BORDER}`,
    paddingTop: '12px',
  },
  debugToggle: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: MONO,
    fontSize: '10px',
    color: '#9e8e84',
    letterSpacing: '1.5px',
    padding: 0,
    textTransform: 'uppercase',
  },
  debugPanel: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  intimacyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: MONO,
    fontSize: '11px',
    color: MUTED,
  },
  bar: {
    height: '6px',
    background: '#e4dcd4',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    background: '#c8964e',
    borderRadius: '3px',
    transition: 'width 0.35s ease',
  },
  debugForm: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  debugLabel: { fontFamily: MONO, fontSize: '11px', color: MUTED },
  debugInput: {
    width: '72px',
    padding: '4px 8px',
    border: `1.5px solid ${SOFT_BORDER}`,
    borderRadius: '4px',
    fontFamily: MONO,
    fontSize: '11px',
    background: 'white',
    color: INK,
    outline: 'none',
  },
  debugApply: {
    padding: '4px 10px',
    background: INK,
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontFamily: MONO,
    fontSize: '11px',
    cursor: 'pointer',
  },
  debugReset: {
    padding: '4px 10px',
    background: 'white',
    color: INK,
    border: `1.5px solid ${SOFT_BORDER}`,
    borderRadius: '4px',
    fontFamily: MONO,
    fontSize: '11px',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
}
