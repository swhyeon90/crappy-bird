import { createFileRoute } from '@tanstack/react-router'
import CrappyBirdFullBody from '../resources/images/full-body-temp.png'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-500">
      <div className="flex flex-col items-center justify-center h-screen gap-6 p-4">
        <img
          src={CrappyBirdFullBody}
          alt="Center Image"
          className="w-64 h-64 object-contain"
        />
        <input
          type="text"
          className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Talk to Crappy Bird..."
        />
      </div>
    </div>
  )
}
