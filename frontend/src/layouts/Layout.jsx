import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import DisclaimerBanner from '../components/DisclaimerBanner.jsx'
import ChatWidget from '../components/ChatWidget.jsx'

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

function themeIcon(dark) {
  return dark ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}

export default function Layout() {
  const [dark, setDark] = useState(() => localStorage.getItem('mg-theme') === 'dark')

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('mg-theme', dark ? 'dark' : 'light')
  }, [dark])

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
        <div className="sidebar-footer">
          <span>CTS Techathon · synthetic data</span>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setDark((d) => !d)}
            title="Toggle dark mode"
          >
            {themeIcon(dark)}
            {dark ? 'Light' : 'Dark'}
          </button>
        </div>
      </aside>
      <div className="main-column">
        <DisclaimerBanner />
        <main className="content">
          <Outlet />
        </main>
      </div>
      <ChatWidget />
    </div>
  )
}
