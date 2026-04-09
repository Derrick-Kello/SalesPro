import { createContext, useContext, useState, useEffect } from 'react'

const STORAGE_KEY = 'pos-currency'

const CURRENCIES = [
  { code: 'GHS', symbol: 'GH₵', name: 'Ghana Cedi' },
  { code: 'USD', symbol: '$',    name: 'US Dollar' },
  { code: 'EUR', symbol: '€',    name: 'Euro' },
  { code: 'GBP', symbol: '£',    name: 'British Pound' },
  { code: 'NGN', symbol: '₦',    name: 'Nigerian Naira' },
  { code: 'KES', symbol: 'KSh',  name: 'Kenyan Shilling' },
  { code: 'ZAR', symbol: 'R',    name: 'South African Rand' },
  { code: 'XOF', symbol: 'CFA',  name: 'West African CFA' },
]

const DEFAULT = CURRENCIES[0]

const CurrencyContext = createContext(null)

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
      return CURRENCIES.find(c => c.code === saved?.code) || DEFAULT
    } catch { return DEFAULT }
  })

  function setCurrency(code) {
    const found = CURRENCIES.find(c => c.code === code) || DEFAULT
    setCurrencyState(found)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(found))
  }

  const fmt = (n) => `${currency.symbol}${(Number(n) || 0).toFixed(2)}`

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, currencies: CURRENCIES, fmt }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
