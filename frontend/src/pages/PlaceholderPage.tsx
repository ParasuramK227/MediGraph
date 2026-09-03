import type { LucideIcon } from 'lucide-react'
import './PlaceholderPage.css'

interface PlaceholderPageProps {
  title: string
  description: string
  icon: LucideIcon
}

export function PlaceholderPage({ title, description, icon: Icon }: PlaceholderPageProps) {
  return (
    <section className="placeholder-page">
      <div className="placeholder-page__icon">
        <Icon size={28} aria-hidden />
      </div>
      <h1 className="placeholder-page__title">{title}</h1>
      <p className="placeholder-page__desc">
        {description}
      </p>
      <p className="placeholder-page__note">This module is under construction.</p>
    </section>
  )
}
