import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ArcDashboard from './ArcDashboard'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ArcDashboard />
  </StrictMode>,
)
