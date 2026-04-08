import { useState, useCallback } from 'react'

// Returns [loading, error, run] — wraps any async fn with loading + error state
export function useAsync() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const run = useCallback(async (fn) => {
    setLoading(true)
    setError('')
    try {
      const result = await fn()
      return result
    } catch (err) {
      setError(err.message || 'Something went wrong')
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return [loading, error, run, setError]
}
