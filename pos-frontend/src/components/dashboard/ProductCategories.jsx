import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useTabRefresh } from '../../hooks/useTabRefresh'

export default function ProductCategories() {
  const [categories, setCategories] = useState([])

  function load() {
    api.get('/products').then(products => {
      const map = {}
      products.forEach(p => {
        if (!map[p.category]) map[p.category] = { name: p.category, count: 0, totalStock: 0 }
        map[p.category].count++
        map[p.category].totalStock += p.inventory?.quantity ?? 0
      })
      setCategories(Object.values(map).sort((a, b) => a.name.localeCompare(b.name)))
    }).catch(console.error)
  }

  useEffect(() => { load() }, [])
  useTabRefresh('products-categories', load)

  return (
    <div>
      <div className="section-header"><h2>Product Categories</h2></div>
      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Category</th><th>Products</th><th>Total Stock</th></tr></thead>
          <tbody>
            {categories.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No categories found</td></tr>
            )}
            {categories.map(c => (
              <tr key={c.name}>
                <td style={{ fontWeight: 600 }}><span className="badge badge-info">{c.name}</span></td>
                <td>{c.count}</td>
                <td>{c.totalStock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
