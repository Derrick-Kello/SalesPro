import { createContext, useContext, useState } from 'react'

const BranchContext = createContext(null)

export function BranchProvider({ children }) {
  const [selectedBranchId, setSelectedBranchId] = useState(null) // null = all branches

  return (
    <BranchContext.Provider value={{ selectedBranchId, setSelectedBranchId }}>
      {children}
    </BranchContext.Provider>
  )
}

export function useBranch() {
  return useContext(BranchContext)
}
