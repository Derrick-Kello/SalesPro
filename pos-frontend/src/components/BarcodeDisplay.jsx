import { useEffect, useState } from 'react'
import bwipjs from 'bwip-js'

// Renders a UPC-A barcode as an image (works in both screen and print)
export default function BarcodeDisplay({ value }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    if (!value || value.length !== 12) { setSrc(null); return }
    try {
      const canvas = document.createElement('canvas')
      bwipjs.toCanvas(canvas, {
        bcid: 'upca',
        text: value,
        scale: 3,
        height: 12,
        includetext: true,
        textxalign: 'center',
      })
      setSrc(canvas.toDataURL('image/png'))
    } catch (e) {
      console.error('Barcode render error:', e)
      setSrc(null)
    }
  }, [value])

  if (!src) return null

  return (
    <div style={{ textAlign: 'center', marginTop: 8 }}>
      <img src={src} alt={value} style={{ maxWidth: '100%' }} />
    </div>
  )
}
