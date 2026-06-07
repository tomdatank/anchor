import { useEffect, useState } from 'react'
import { supabase } from './supabase'

function App() {
  const [session, setSession] = useState(null)
  const [entries, setEntries] = useState([])
  const [text, setText] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
  }, [])

  useEffect(() => {
    if (session) loadEntries()
  }, [session])

  const loadEntries = async () => {
    const { data } = await supabase.from('journal_entries').select('*')
    setEntries(data || [])
  }

  const signUp = async () => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setAuthError(error.message)
    else setAuthError('Check your email to confirm your account.')
  }

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setEntries([])
  }

  const save = async () => {
    if (!text.trim()) return
    await supabase.from('journal_entries').insert({ content: text })
    setText('')
    loadEntries()
  }

  if (!session) {
    return (
      <div style={{ padding: 40 }}>
        <h1>Anchor</h1>
        <input
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ display: 'block', marginBottom: 8 }}
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ display: 'block', marginBottom: 8 }}
        />
        <button onClick={signIn} style={{ marginRight: 8 }}>Sign in</button>
        <button onClick={signUp}>Create account</button>
        {authError && <p style={{ color: 'red' }}>{authError}</p>}
      </div>
    )
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Anchor</h1>
      <p>Logged in as {session.user.email} <button onClick={signOut}>Sign out</button></p>
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Type something..."
        style={{ marginRight: 8 }}
      />
      <button onClick={save}>Save</button>
      <ul>
        {entries.map(e => <li key={e.id}>{e.content}</li>)}
      </ul>
    </div>
  )
}

export default App