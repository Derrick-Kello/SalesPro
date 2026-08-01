import { useEffect, useState } from 'react'
import { isOnline, subscribe } from '../offline/connectivity'

/** Live connection state as observed by real API traffic (see offline/connectivity). */
export function useOnlineStatus() {
  const [online, setOnline] = useState(isOnline)
  useEffect(() => subscribe(setOnline), [])
  return online
}

export default useOnlineStatus
