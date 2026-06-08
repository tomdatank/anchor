import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabase'
import Auth from './components/Auth'
import Nav from './components/Nav'
import Dashboard from './pages/Dashboard'
import Goals from './pages/Goals'
import Journal from './pages/Journal'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
  }, [])

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>

  if (!session) return <Auth />

  return (
    <BrowserRouter>
      <Nav session={session} />
      <Routes>
        <Route path="/" element={<Dashboard session={session} />} />
        <Route path="/goals" element={<Goals session={session} />} />
        <Route path="/journal" element={<Journal session={session} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App