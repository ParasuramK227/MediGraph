import { NavLink, Outlet } from 'react-router-dom'
import DisclaimerBanner from '../components/DisclaimerBanner.jsx'

const NAV = [
  { section: null, items: [{ to: '/', label: 'Dashboard', end: true }] },
  {
    section: 'Clinical',
    items: [
      { to: '/patients', label: 'Patients' },
      { to: '/treatments', label: 'Treatment Intelligence' },
    ],
  },
  {
    section: 'Pharmaceutical',
    items: [
      { to: '/medicines', label: 'Medicines' },
      { to: '/supply-chain', label: 'Supply Chain' },
      { to: '/shortages', label: 'Shortages' },
    ],
  },
  { section: 'Knowledge', items: [{ to: '/knowledge-graph', label: 'Knowledge Graph' }] },
  { section: 'Assistant', items: [{ to: '/chatbot', label: 'Chatbot' }] },
]

export default function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">MediGraph</span>
          <span className="brand-sub">AI · prototype</span>
        </div>
        <nav>
          {NAV.map((group, i) => (
            <div key={i} className="nav-group">
              {group.section && <div className="nav-section">{group.section}</div>}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">CTS Techathon · synthetic data only</div>
      </aside>
      <div className="main-column">
        <DisclaimerBanner />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
