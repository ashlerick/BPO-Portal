import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// BPO Time's "Open the portal" button opens the portal with ?connect=app. Remember it for the tab, and take it off the address,
// so it survives signing in first: once someone is signed in, the Launch App button connects the app by itself (DesktopAppButton).
try {
  const url = new URL(window.location.href)
  if (url.searchParams.get('connect') === 'app') {
    sessionStorage.setItem('bpotime:connect', '1')
    url.searchParams.delete('connect')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }
} catch {
  // storage blocked: the person presses Launch App as before
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
