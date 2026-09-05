import { NavLink } from 'react-router-dom'
import {
  Database,
  FolderKanban,
  HeartPulse,
  LayoutDashboard,
  MessageSquare,
  Share2,
  Stethoscope,
  Users,
  X,
} from 'lucide-react'
import './SideNav.css'

interface NavEntry {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
}

const NAV_SECTIONS: { title?: string; items: NavEntry[] }[] = [
  {
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    title: 'Patients',
    items: [
      { to: '/patients', label: 'Patients', icon: Users },
      { to: '/sectors', label: 'Sectors', icon: FolderKanban },
    ],
  },
  {
    title: 'Insights',
    items: [
      { to: '/treatment-intelligence', label: 'Treatment Intel', icon: HeartPulse },
    ],
  },
  {
    title: 'Knowledge Graph',
    items: [
      { to: '/graph', label: 'Graph Explorer', icon: Share2 },
      { to: '/admin/graph', label: 'Admin Graph', icon: Database },
    ],
  },
  {
    items: [{ to: '/chatbot', label: 'Chatbot', icon: MessageSquare }],
  },
]

interface SideNavProps {
  onClose: () => void
}

export function SideNav({ onClose }: SideNavProps) {
  return (
    <nav className="sidenav">
      <div className="sidenav__header">
        <div className="sidenav__brand">
          <span className="sidenav__logo" aria-hidden>
            <Stethoscope size={22} />
          </span>
          <span className="sidenav__title">MediGraph</span>
        </div>
        <button
          type="button"
          className="sidenav__close"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <X size={20} aria-hidden />
        </button>
      </div>

      {NAV_SECTIONS.map((section, i) => (
        <div className="sidenav__section" key={i}>
          {section.title && (
            <div className="sidenav__section-title">{section.title}</div>
          )}
          <ul className="sidenav__list">
            {section.items.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onClose}
                    className={({ isActive }) =>
                      isActive ? 'sidenav__link sidenav__link--active' : 'sidenav__link'
                    }
                  >
                    <Icon size={18} className="sidenav__link-icon" aria-hidden />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
