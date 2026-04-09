import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import { useAuth } from './AuthContext'

const PermissionContext = createContext(null)

export function PermissionProvider({ children }) {
  const { token, user } = useAuth()
  const [perms, setPerms] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!token) { setPerms(null); setLoading(false); return }
    try {
      const data = await api.get('/settings/permissions/mine')
      setPerms(data)
    } catch {
      setPerms(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const can = useCallback((key) => {
    if (!user) return false
    if (user.role === 'ADMIN') return true
    if (!perms) return false
    return !!perms[key]
  }, [user, perms])

  const reload = useCallback(() => {
    setLoading(true)
    return load()
  }, [load])

  return (
    <PermissionContext.Provider value={{ can, perms, loading, reload }}>
      {children}
    </PermissionContext.Provider>
  )
}

export function usePermissions() {
  return useContext(PermissionContext)
}
