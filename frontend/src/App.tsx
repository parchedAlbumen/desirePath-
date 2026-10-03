import { Navigate, Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav.tsx'
import { HistoryPage } from './pages/HistoryPage.tsx'
import { PlanPage } from './pages/PlanPage.tsx'
import { RoutesPage } from './pages/RoutesPage.tsx'
import { RunPage } from './pages/RunPage.tsx'
import { AppStateProvider } from './state/AppStateProvider.tsx'

function App() {
  return (
    <AppStateProvider>
      <div className="app">
        <Routes>
          <Route path="/" element={<PlanPage />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/run" element={<RunPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <BottomNav />
      </div>
    </AppStateProvider>
  )
}

export default App
