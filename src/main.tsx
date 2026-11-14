import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { MissionProvider } from './hooks/useMission'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MissionProvider>
      <App />
    </MissionProvider>
  </StrictMode>,
)
