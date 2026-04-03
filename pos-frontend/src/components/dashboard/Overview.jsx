import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { DollarSign, ShoppingBag, Package2, AlertTriangle } from 'lucide-react'

export default function Overview() {
  const [daily, setDaily] = useState(null)
  const [products, setProducts] = useState([])
  const [inventory, setInventory] = useState([])

  useEffect(() => {
    Promise.all([
      api.get('/reports/daily'),
      api.get('/products'),
      api.get('/inventory'),
    ]).then(([d, p, inv]) => {
      setDaily(d)
      setProducts(p)
      setInventory(inv)
    }).catch(console.error)
  }, [])

  const lowStock = inventory.filter(i => i.quantity <= i.lowStockAlert)

  return (
    <div>
      <h2>Overview</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-accent" />
          <div className="stat-icon"><DollarSign size={20} strokeWidth={2} /></div>
          <div className="stat-label">Today's Revenue</div>
          <div className="stat-value">${daily ? daily.totalRevenue.toFixed(2) : '0.00'}</div>
        </div>

        <div className="stat-card success">
          <div className="stat-card-accent" />
          <div className="stat-icon"><ShoppingBag size={20} strokeWidth={2} /></div>
          <div className="stat-label">Transactions Today</div>
          <div className="stat-value">{daily ? daily.totalTransactions : 0}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-accent" />
          <div className="stat-icon"><Package2 size={20} strokeWidth={2} /></div>
          <div className="stat-label">Total Products</div>
          <div className="stat-value">{products.length || 0}</div>
        </div>

        <div className="stat-card warning">
          <div className="stat-card-accent" />
          <div className="stat-icon"><AlertTriangle size={20} strokeWidth={2} /></div>
          <div className="stat-label">Low Stock Items</div>
          <div className="stat-value">{lowStock.length}</div>
        </div>
      </div>

      <div className="overview-grid">
        <div className="card">
          <h3>Top Products Today</h3>
          {daily?.topProducts?.length
            ? daily.topProducts.slice(0, 5).map(p => (
                <div key={p.name} className="list-item">
                  <span className="list-item-name">{p.name}</span>
                  <span className="list-item-value">${p.revenue.toFixed(2)}</span>
                </div>
              ))
            : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sales recorded today yet.</p>
          }
        </div>

        <div className="card">
          <h3>Low Stock Alerts</h3>
          {lowStock.length
            ? lowStock.slice(0, 5).map(i => (
                <div key={i.productId} className="list-item">
                  <span className="list-item-name">{i.product.name}</span>
                  <span className="list-item-value danger">{i.quantity} left</span>
                </div>
              ))
            : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>All stock levels are healthy.</p>
          }
        </div>
      </div>
    </div>
  )
}
