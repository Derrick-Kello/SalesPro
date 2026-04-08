import { createContext, useContext, useEffect, useRef } from 'react'

// Dashboard sets this to the currently active tab key
export const ActiveTabContext = createContext('overview')

/**
 * Call `onRefresh` silently whenever this tab becomes active again
 * (not on first mount — that's handled by the component's own useEffect).
 */
export function useTabRefresh(tabKey, onRefresh) {
  const activeTab = useContext(ActiveTabContext)
  const mounted = useRef(false)

  useEffect(() => {
    // Skip the initial mount — component already loads its own data
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (activeTab === tabKey) {
      onRefresh()
    }
  }, [activeTab])
}
