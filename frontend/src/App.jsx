import { Route, Routes } from 'react-router-dom'
import Layout from './layouts/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Patients from './pages/Patients.jsx'
import PatientDetail from './pages/PatientDetail.jsx'
import Treatments from './pages/Treatments.jsx'
import Medicines from './pages/Medicines.jsx'
import MedicineDetail from './pages/MedicineDetail.jsx'
import SupplyChain from './pages/SupplyChain.jsx'
import Shortages from './pages/Shortages.jsx'
import KnowledgeGraph from './pages/KnowledgeGraph.jsx'
import Chatbot from './pages/Chatbot.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/patients" element={<Patients />} />
        <Route path="/patients/:patientId" element={<PatientDetail />} />
        <Route path="/treatments" element={<Treatments />} />
        <Route path="/medicines" element={<Medicines />} />
        <Route path="/medicines/:medicationId" element={<MedicineDetail />} />
        <Route path="/supply-chain" element={<SupplyChain />} />
        <Route path="/shortages" element={<Shortages />} />
        <Route path="/knowledge-graph" element={<KnowledgeGraph />} />
        <Route path="/chatbot" element={<Chatbot />} />
      </Route>
    </Routes>
  )
}
