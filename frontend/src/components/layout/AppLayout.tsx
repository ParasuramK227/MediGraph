import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { SideNav } from './SideNav'
import { ThemeToggle } from './ThemeToggle'
import { BackendStatus } from './BackendStatus'
import { ChatFloatingButton } from '../chat/ChatFloatingButton'
import './AppLayout.css'

export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="app-layout">
      <button
        type="button"
        className="app-layout__drawer-backdrop"
        onClick={() => setNavOpen(false)}
        aria-hidden={!navOpen}
        tabIndex={-1}
      />

      <aside className={`app-layout__nav ${navOpen ? 'app-layout__nav--open' : ''}`}>
        <SideNav onClose={() => setNavOpen(false)} />
      </aside>

      <div className="app-layout__main">
        <header className="app-layout__topbar">
          <button
            type="button"
            className="app-layout__menu"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={22} aria-hidden />
          </button>
          <div className="app-layout__topbar-spacer" />
          <BackendStatus />
          <ThemeToggle />
        </header>

        <main className="app-layout__content">
          <Outlet />
        </main>
      </div>

      <ChatFloatingButton />
    </div>
  )
}
