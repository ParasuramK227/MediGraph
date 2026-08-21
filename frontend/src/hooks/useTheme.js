import { useEffect, useState } from 'react'

/** Tracks the app theme (html[data-theme]) set by Layout's toggle. */
export default function useTheme() {
  const [theme, setTheme] = useState(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  )

  useEffect(() => {
    const read = () =>
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  return theme
}
