import { createFileRoute } from '@tanstack/react-router'
import { FormEvent, useEffect, useState } from 'react'
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
  | {
      id: string
      type: 'chat'
      message: string
      response: CrappyBirdResponse
    }
  | {
      id: string
      type: 'action'
      action: UserAction
      response: CrappyBirdResponse
    }

type InteractionIntent =
  | { type: 'chat'; message: string }
  | { type: 'action'; action: UserAction }

const ACTIONS: UserAction[] = ['poke', 'feed crumb']
const DEFAULT_CHAT_ACTION: UserAction = 'none'

const clampIntimacy = (value: number) =>
  Math.min(INTIMACY_MAX, Math.max(INTIMACY_MIN, value))

export const Route = createFileRoute('/')({ component: App })

function App() {
  const [mood, setMood] = useState(INITIAL_MOOD)
  const [activity, setActivity] = useState(INITIAL_ACTIVITY)
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [interactions, setInteractions] = useState<InteractionRecord[]>([])
  const [intimacyLevel, setIntimacyLevel] = useState(() => getIntimacy())
  const [manualIntimacy, setManualIntimacy] = useState(() =>
    String(getIntimacy()),
  )
  const interactionLog = [...interactions].reverse()
  const latestResponse =
    interactions.length > 0 ? interactions[interactions.length - 1].response : null

  useEffect(() => {
    setIntimacyLevel(getIntimacy())
  }, [])

  useEffect(() => {
    setManualIntimacy(String(intimacyLevel))
  }, [intimacyLevel])

  const applyIntimacyDelta = (delta: number) => {
    if (!delta) return

    changeIntimacy(delta)
    setIntimacyLevel((prev) => clampIntimacy(prev + delta))
  }

  async function sendInteraction(intent: InteractionIntent) {
    const trimmedMessage =
      intent.type === 'chat' ? intent.message.trim() : ''
    const lastInteraction =
      interactions.length > 0 ? interactions[interactions.length - 1] : null
    const lastReflection = lastInteraction?.response.reflection ?? ''

    if (intent.type === 'chat' && !trimmedMessage) {
      return
    }

    const payload: CrappyBirdInput = {
      action: intent.type === 'action' ? intent.action : DEFAULT_CHAT_ACTION,
      chat: intent.type === 'chat' ? trimmedMessage : '',
      mood,
      activity,
      last_reflection: lastReflection,
      intimacy: intimacyLevel,
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Crappy Bird is feeling too frazzled to reply.')
      }

      const data = (await response.json()) as CrappyBirdResponse

      setMood(data.mood)
      setActivity(data.activity)
      setInteractions((prev) => {
        const id = typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`

        const nextRecord: InteractionRecord =
          intent.type === 'chat'
            ? { id, type: 'chat', message: trimmedMessage, response: data }
            : { id, type: 'action', action: intent.action, response: data }

        return [...prev, nextRecord]
      })

      if (intent.type === 'chat') {
        setMessage('')
      }

      if (Number.isFinite(data.feeling_delta)) {
        applyIntimacyDelta(Math.round(data.feeling_delta))
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to reach Crappy Bird.'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAction = (action: UserAction) => {
    if (isLoading) return
    void sendInteraction({ type: 'action', action })
  }

  const handleResetIntimacy = () => {
    setIntimacy(INTIMACY_MIN)
    setIntimacyLevel(INTIMACY_MIN)
  }

  const handleManualIntimacySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = Number(manualIntimacy)
    if (!Number.isFinite(parsed)) return
    const clamped = clampIntimacy(parsed)
    setIntimacy(clamped)
    setIntimacyLevel(clamped)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isLoading) return
    void sendInteraction({ type: 'chat', message })
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-500 flex items-center justify-center px-4 py-10">
      <div className="flex flex-col items-center gap-6 p-4 w-full max-w-3xl">
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="relative flex items-center justify-center w-full max-w-sm">
            <img
              src={CrappyBirdFullBody}
              alt="Crappy Bird"
              className="w-64 h-64 object-contain mx-auto"
            />
            <div className="bg-white/90 border border-slate-200 rounded-2xl shadow px-4 py-3 text-sm text-slate-700 lowercase max-w-[180px] md:absolute md:right-full md:mr-4 md:top-1/2 md:-translate-y-1/2 text-center md:text-left">
              {latestResponse?.chat?.trim()
                ? latestResponse.chat
                : '...'}
            </div>
          </div>
          <p className="text-sm text-slate-600 lowercase text-center italic max-w-md">
            {latestResponse?.reflection ||
              'the air feels still. crappy bird watches quietly.'}
          </p>
        </div>

        <div className="text-center text-slate-700">
          <p className="text-lg font-semibold">
            mood: <span className="font-normal lowercase">{mood}</span>
          </p>
          <p className="text-lg font-semibold">
            activity: <span className="font-normal lowercase">{activity}</span>
          </p>
        </div>

        <form
          onSubmit={handleManualIntimacySubmit}
          className="w-full max-w-xl flex flex-wrap gap-2 items-center justify-between text-sm text-slate-600 lowercase"
        >
          <label className="flex-1 min-w-[180px]">
            set intimacy manually
            <input
              type="number"
              value={manualIntimacy}
              onChange={(event) => setManualIntimacy(event.target.value)}
              min={INTIMACY_MIN}
              max={INTIMACY_MAX}
              className="mt-1 w-full px-3 py-1.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <button
            type="submit"
            className="px-4 py-2 font-medium rounded-md bg-slate-900 text-white"
          >
            apply level
          </button>
        </form>

        <div className="text-sm text-slate-600 lowercase w-full max-w-xl space-y-2">
          <div className="flex items-center justify-between">
            <span>intimacy level</span>
            <span>
              {intimacyLevel}/{INTIMACY_MAX}
            </span>
          </div>
          <div className="h-2 w-full bg-white/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-900 transition-[width] duration-300"
              style={{
                width: `${(intimacyLevel / INTIMACY_MAX) * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center justify-center">
          {ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              disabled={isLoading}
              onClick={() => handleAction(action)}
              className="px-4 py-2 text-sm font-medium lowercase rounded-md bg-slate-900 text-white disabled:opacity-40"
            >
              {action}
            </button>
          ))}
          <button
            type="button"
            onClick={handleResetIntimacy}
            disabled={intimacyLevel === INTIMACY_MIN}
            className="px-4 py-2 text-sm font-medium lowercase rounded-md border border-slate-900 text-slate-900 disabled:opacity-40"
          >
            reset intimacy
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full max-w-xl flex gap-3 items-center"
        >
          <input
            type="text"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="talk to crappy bird..."
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 lowercase disabled:bg-slate-100"
          />
          <button
            type="submit"
            disabled={isLoading || !message.trim()}
            className="px-4 py-2 font-medium rounded-lg bg-blue-600 text-white disabled:opacity-40"
          >
            {isLoading ? '...' : 'send'}
          </button>
        </form>

        {error ? (
          <p className="text-sm text-red-600 lowercase">{error}</p>
        ) : null}

        <div className="w-full max-w-xl space-y-3">
          {interactionLog.map((entry) => (
            <div
              key={entry.id}
              className="p-4 rounded-lg bg-white/80 shadow-sm border border-slate-200 space-y-2"
            >
              <p className="text-sm text-slate-600 lowercase">
                you&nbsp;
                {entry.type === 'chat'
                  ? `say "${entry.message}"`
                  : `do ${entry.action}`}
              </p>
              <div className="text-sm text-slate-800 lowercase space-y-1">
                <p>action: {entry.response.action?.join(', ') || 'still'}</p>
                <p>chat: {entry.response.chat || '...'}</p>
                <p>reflection: {entry.response.reflection}</p>
                <p>mood → {entry.response.mood}</p>
                <p>activity → {entry.response.activity}</p>
                <p>feeling delta → {entry.response.feeling_delta}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
