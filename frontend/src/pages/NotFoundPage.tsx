import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { PlaceholderPage } from './PlaceholderPage'

export function NotFoundPage() {
  return (
    <div className="page">
      <PlaceholderPage
        title="Page not found"
        description="The page you're looking for doesn't exist."
        icon={Compass}
      />
      <Link to="/" className="notfound-link">
        Back to dashboard
      </Link>
    </div>
  )
}
