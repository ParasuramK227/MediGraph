import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { PatientsPage } from './pages/PatientsPage'
import { PatientDetailPage } from './pages/PatientDetailPage'
import { SectorsPage } from './pages/SectorsPage'
import { SectorViewPage } from './pages/SectorViewPage'
import { TreatmentIntelligencePage } from './pages/TreatmentIntelligencePage'
import { TreatmentIntelPatientPage } from './pages/TreatmentIntelPatientPage'
import { GraphExplorerPage } from './pages/GraphExplorerPage'
import { ChatbotPage } from './pages/ChatbotPage'
import { NotFoundPage } from './pages/NotFoundPage'
import './styles/page.css'

const AdminGraphPage = lazy(() =>
  import('./pages/AdminGraphPage').then((m) => ({ default: m.AdminGraphPage })),
)

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/patients" element={<PatientsPage />} />
        <Route path="/patients/:id" element={<PatientDetailPage />} />
        <Route path="/sectors" element={<SectorsPage />} />
        <Route path="/sectors/:id" element={<SectorViewPage />} />
        <Route
          path="/treatment-intelligence"
          element={<TreatmentIntelligencePage />}
        />
        <Route
          path="/treatment-intelligence/:id"
          element={<TreatmentIntelPatientPage />}
        />
        <Route path="/graph" element={<GraphExplorerPage />} />
        <Route
          path="/admin/graph"
          element={
            <Suspense fallback={<div>Loading admin graph…</div>}>
              <AdminGraphPage />
            </Suspense>
          }
        />
        <Route path="/chatbot" element={<ChatbotPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
