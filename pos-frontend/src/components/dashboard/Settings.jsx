import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { usePermissions } from '../../context/PermissionContext'
import Modal from '../Modal'
import { SaveBtn } from '../LoadingRow'
import { useAsync } from '../../hooks/useAsync'
import {
  Shield, Save, RotateCcw, ChevronDown, ChevronRight,
  Pencil, UserCheck, UserX, KeyRound, Search,
  Plus, Trash2, Copy,
} from 'lucide-react'
import { useAlert } from '../../context/AlertContext'

const BUILT_IN_ROLES = ['ADMIN', 'MANAGER', 'CASHIER']
const BUILT_IN_LABELS = { MANAGER: 'Manager', CASHIER: 'Cashier' }
const ROLE_BADGE = { ADMIN: 'badge-info', MANAGER: 'badge-warning', CASHIER: 'badge-success' }

function roleBadgeClass(role) {
  return ROLE_BADGE[role] || 'badge-warning'
}
function roleLabel(role, customRoles) {
  if (BUILT_IN_LABELS[role]) return BUILT_IN_LABELS[role]
  if (role === 'ADMIN') return 'Admin'
  return customRoles?.[role]?.name || role
}

function Toggle({ on, onChange, size = 36 }) {
  const h = Math.round(size * 0.55)
  const dot = h - 4
  return (
    <button onClick={onChange} style={{
      width: size, height: h, borderRadius: h, border: 'none',
      background: on ? 'var(--primary)' : 'var(--border2)',
      cursor: 'pointer', position: 'relative', transition: 'background 0.15s',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? size - dot - 2 : 2,
        width: dot, height: dot, borderRadius: '50%', background: '#fff',
        transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
      }} />
    </button>
  )
}

// ── Permission Grid (reused for role defaults, per-user, and custom roles) ──
function PermissionGrid({ groups, perms, onChange, roleDefaults, showResetHint }) {
  const [collapsed, setCollapsed] = useState({})

  function toggleGroup(group) {
    setCollapsed(p => ({ ...p, [group]: !p[group] }))
  }

  function toggleAllInGroup(groupPerms, value) {
    const updates = {}
    for (const p of groupPerms) updates[p.key] = value
    onChange(updates)
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 80px',
        background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
        padding: '10px 16px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase',
        letterSpacing: '0.5px', color: 'var(--text-muted)',
      }}>
        <div>Permission</div>
        <div style={{ textAlign: 'center' }}>Allowed</div>
      </div>
      {groups.map(g => {
        const isCollapsed = collapsed[g.group]
        const allOn = g.permissions.every(p => perms[p.key])
        return (
          <div key={g.group}>
            <div onClick={() => toggleGroup(g.group)} style={{
              display: 'grid', gridTemplateColumns: '1fr 80px',
              padding: '10px 16px', background: 'var(--surface2)',
              borderBottom: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                {g.group}
                <span style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 400 }}>({g.permissions.length})</span>
              </div>
              <div style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                <Toggle on={allOn} onChange={() => toggleAllInGroup(g.permissions, !allOn)} size={28} />
              </div>
            </div>
            {!isCollapsed && g.permissions.map(p => {
              const on = !!perms[p.key]
              const isOverride = roleDefaults && roleDefaults[p.key] !== on
              return (
                <div key={p.key} style={{
                  display: 'grid', gridTemplateColumns: '1fr 80px',
                  padding: '9px 16px 9px 40px', borderBottom: '1px solid var(--border)',
                  fontSize: 13, alignItems: 'center',
                  background: isOverride ? 'rgba(59,130,246,0.04)' : undefined,
                }}>
                  <div style={{ color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {p.label}
                    {isOverride && <span style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 600 }}>CUSTOM</span>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <Toggle on={on} onChange={() => onChange({ [p.key]: !on })} />
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── Main Settings Component ──────────────────────────────────────────────────
export default function Settings() {
  const { reload: reloadPerms } = usePermissions()
  const { showError } = useAlert()

  const [groups, setGroups] = useState([])
  const [roles, setRoles] = useState({})
  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [userOverrides, setUserOverrides] = useState({})
  const [customRoles, setCustomRoles] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Tab: 'users' | 'role-defaults' | 'custom-roles'
  const [tab, setTab] = useState('users')

  // Role defaults draft
  const [roleDraft, setRoleDraft] = useState({})
  const [roleSaving, setRoleSaving] = useState(false)
  const [roleSaved, setRoleSaved] = useState(false)

  // Edit user modal
  const [editModal, setEditModal] = useState(false)
  const [editForm, setEditForm] = useState({ fullName: '', role: '', branchId: '', password: '' })
  const [editUserId, setEditUserId] = useState(null)
  const [editSaving, editError, runEditSave, setEditError] = useAsync()

  // Per-user permissions modal
  const [permModal, setPermModal] = useState(false)
  const [permUser, setPermUser] = useState(null)
  const [permDraft, setPermDraft] = useState({})
  const [permSaving, setPermSaving] = useState(false)

  // Custom role modal
  const [crModal, setCrModal] = useState(false)
  const [crEditKey, setCrEditKey] = useState(null)
  const [crName, setCrName] = useState('')
  const [crPerms, setCrPerms] = useState({})
  const [crSaving, crError, runCrSave, setCrError] = useAsync()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await api.get('/settings/permissions')
      setGroups(data.groups)
      setRoles(data.roles)
      setRoleDraft(JSON.parse(JSON.stringify(data.roles)))
      setUsers(data.users)
      setBranches(data.branches || [])
      setUserOverrides(data.userOverrides || {})
      setCustomRoles(data.customRoles || {})
    } catch (err) {
      console.error('Failed to load settings', err)
    } finally { setLoading(false) }
  }

  // ── User actions ──────────────────────────────────────────────────────────

  async function toggleActive(u) {
    if (!confirm(`${u.isActive ? 'Disable' : 'Enable'} account for ${u.fullName}?`)) return
    try {
      await api.put(`/users/${u.id}`, { isActive: !u.isActive })
      load()
    } catch (err) { showError(err.message) }
  }

  function openEdit(u) {
    setEditUserId(u.id)
    setEditForm({
      fullName: u.fullName,
      role: u.role,
      branchId: u.branchId ? String(u.branchId) : '',
      password: '',
    })
    setEditError(''); setEditModal(true)
  }

  async function saveEdit() {
    if (!editForm.fullName) { setEditError('Full name is required'); return }
    await runEditSave(async () => {
      const payload = {
        fullName: editForm.fullName,
        role: editForm.role,
        branchId: editForm.branchId ? parseInt(editForm.branchId) : null,
      }
      if (editForm.password) payload.password = editForm.password
      await api.put(`/users/${editUserId}`, payload)
      setEditModal(false); load()
    })
  }

  // ── Per-user permissions ──────────────────────────────────────────────────

  async function openPerms(u) {
    setPermUser(u)
    try {
      const data = await api.get(`/settings/permissions/user/${u.id}`)
      const base = { ...data.roleDefaults }
      if (data.userOverrides) {
        for (const k of Object.keys(data.userOverrides)) base[k] = data.userOverrides[k]
      }
      setPermDraft(base)
    } catch (err) {
      console.error(err)
      const base = roles[u.role] || {}
      setPermDraft({ ...base })
    }
    setPermModal(true)
  }

  async function savePerms() {
    if (!permUser) return
    setPermSaving(true)
    try {
      await api.put(`/settings/permissions/user/${permUser.id}`, { permissions: permDraft })
      setPermModal(false)
      reloadPerms()
      load()
    } catch (err) { showError(err.message) }
    finally { setPermSaving(false) }
  }

  async function resetPerms() {
    if (!permUser) return
    if (!confirm(`Reset ${permUser.fullName}'s permissions back to their role defaults?`)) return
    setPermSaving(true)
    try {
      await api.delete(`/settings/permissions/user/${permUser.id}`)
      setPermModal(false)
      reloadPerms()
      load()
    } catch (err) { showError(err.message) }
    finally { setPermSaving(false) }
  }

  function handlePermChange(updates) {
    setPermDraft(prev => ({ ...prev, ...updates }))
  }

  // ── Role defaults ─────────────────────────────────────────────────────────

  const roleHasChanges = JSON.stringify(roleDraft) !== JSON.stringify(roles)

  async function saveRoleDefaults() {
    setRoleSaving(true)
    try {
      for (const role of Object.keys(BUILT_IN_LABELS)) {
        if (roleDraft[role]) {
          await api.put('/settings/permissions', { role, permissions: roleDraft[role] })
        }
      }
      setRoles(JSON.parse(JSON.stringify(roleDraft)))
      setRoleSaved(true)
      reloadPerms()
      setTimeout(() => setRoleSaved(false), 3000)
    } catch (err) { showError(err.message) }
    finally { setRoleSaving(false) }
  }

  // ── Custom role actions ───────────────────────────────────────────────────

  function openCreateRole() {
    setCrEditKey(null)
    setCrName('')
    const empty = {}
    groups.forEach(g => g.permissions.forEach(p => { empty[p.key] = false }))
    setCrPerms(empty)
    setCrError('')
    setCrModal(true)
  }

  function openEditRole(key, def) {
    setCrEditKey(key)
    setCrName(def.name)
    const perms = {}
    groups.forEach(g => g.permissions.forEach(p => { perms[p.key] = !!(def.permissions && def.permissions[p.key]) }))
    setCrPerms(perms)
    setCrError('')
    setCrModal(true)
  }

  function openDuplicateRole(key, def) {
    setCrEditKey(null)
    setCrName(def.name + ' (copy)')
    const perms = {}
    groups.forEach(g => g.permissions.forEach(p => { perms[p.key] = !!(def.permissions && def.permissions[p.key]) }))
    setCrPerms(perms)
    setCrError('')
    setCrModal(true)
  }

  async function saveCustomRole() {
    if (!crName.trim()) { setCrError('Role name is required'); return }
    await runCrSave(async () => {
      if (crEditKey) {
        await api.put(`/settings/roles/${crEditKey}`, { name: crName.trim(), permissions: crPerms })
      } else {
        await api.post('/settings/roles', { name: crName.trim(), permissions: crPerms })
      }
      setCrModal(false)
      reloadPerms()
      load()
    })
  }

  async function deleteCustomRole(key, name) {
    if (!confirm(`Delete the "${name}" role? Users assigned to it must be reassigned first.`)) return
    try {
      await api.delete(`/settings/roles/${key}`)
      reloadPerms()
      load()
    } catch (err) { showError(err.message) }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const branchMap = Object.fromEntries(branches.map(b => [b.id, b.name]))

  const filteredUsers = users.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return u.fullName.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (customRoles[u.role]?.name || '').toLowerCase().includes(q)
  })

  const allRoleOptions = [
    ...BUILT_IN_ROLES.map(r => ({ key: r, label: r === 'ADMIN' ? 'Admin' : BUILT_IN_LABELS[r] || r })),
    ...Object.entries(customRoles).map(([key, def]) => ({ key, label: def.name || key })),
  ]

  const customRoleEntries = Object.entries(customRoles)
  const usersPerRole = {}
  for (const u of users) {
    usersPerRole[u.role] = (usersPerRole[u.role] || 0) + 1
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="spin" style={{ display: 'inline-block', width: 24, height: 24, border: '3px solid var(--border2)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} />
        <p style={{ marginTop: 12 }}>Loading settings…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="section-header">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={20} strokeWidth={2} /> Settings
        </h2>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[
          { key: 'users', label: 'Users & Permissions' },
          { key: 'custom-roles', label: 'Custom Roles' },
          { key: 'role-defaults', label: 'Role Defaults' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 20px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: 'none', color: tab === t.key ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: -2, transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Users & Permissions Tab ──────────────────────────────────────── */}
      {tab === 'users' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>User Accounts</h3>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                Manage accounts, enable/disable access, and assign individual permissions.
              </p>
            </div>
          </div>

          <div className="search-bar" style={{ marginBottom: 16 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)', pointerEvents: 'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…" style={{ paddingLeft: 36 }} />
            </div>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Custom Perms</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>No users found</td></tr>
                )}
                {filteredUsers.map(u => {
                  const hasOverrides = !!userOverrides[String(u.id)]
                  return (
                    <tr key={u.id} style={{ opacity: u.isActive ? 1 : 0.55 }}>
                      <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 13 }}>{u.username}</td>
                      <td><span className={`badge ${roleBadgeClass(u.role)}`}>{roleLabel(u.role, customRoles)}</span></td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{branchMap[u.branchId] || '—'}</td>
                      <td>
                        <span className={`badge ${u.isActive ? 'badge-success' : 'badge-danger'}`}>
                          {u.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td>
                        {u.role === 'ADMIN'
                          ? <span style={{ fontSize: 12, color: 'var(--text-light)' }}>Full access</span>
                          : hasOverrides
                            ? <span className="badge badge-info" style={{ fontSize: 11 }}>Custom</span>
                            : <span style={{ fontSize: 12, color: 'var(--text-light)' }}>Role default</span>
                        }
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td>
                        {u.role !== 'ADMIN' ? (
                          <div className="action-group">
                            <button className="icon-btn primary" title="Edit account" onClick={() => openEdit(u)}>
                              <Pencil size={13} strokeWidth={2} />
                            </button>
                            <button className="icon-btn" title={u.isActive ? 'Disable account' : 'Enable account'} onClick={() => toggleActive(u)}
                              style={{ color: u.isActive ? 'var(--danger)' : 'var(--success)' }}>
                              {u.isActive ? <UserX size={13} strokeWidth={2} /> : <UserCheck size={13} strokeWidth={2} />}
                            </button>
                            <button className="icon-btn" title="Permissions" onClick={() => openPerms(u)}
                              style={{ color: 'var(--primary)' }}>
                              <KeyRound size={13} strokeWidth={2} />
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Custom Roles Tab ─────────────────────────────────────────────── */}
      {tab === 'custom-roles' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>Custom Roles</h3>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                Create new roles with specific permissions. Assign them to users for tailored access control.
              </p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={openCreateRole}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Plus size={14} strokeWidth={2.5} /> New Role
            </button>
          </div>

          {/* Built-in roles summary */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>Built-in Roles</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {BUILT_IN_ROLES.map(r => {
                const count = usersPerRole[r] || 0
                return (
                  <div key={r} style={{
                    padding: '16px 18px', border: '1px solid var(--border)', borderRadius: 10,
                    background: 'var(--surface2)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span className={`badge ${roleBadgeClass(r)}`} style={{ fontSize: 13 }}>{r === 'ADMIN' ? 'Admin' : BUILT_IN_LABELS[r]}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{count} user{count !== 1 ? 's' : ''}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-light)' }}>
                      {r === 'ADMIN' ? 'Full system access — cannot be restricted'
                        : `Editable via "Role Defaults" tab`}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Custom roles list */}
          <h4 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>
            Custom Roles {customRoleEntries.length > 0 && `(${customRoleEntries.length})`}
          </h4>

          {customRoleEntries.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px 20px', border: '2px dashed var(--border)',
              borderRadius: 12, color: 'var(--text-muted)',
            }}>
              <Shield size={32} strokeWidth={1.5} style={{ opacity: 0.4, marginBottom: 8 }} />
              <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 14 }}>No custom roles yet</p>
              <p style={{ margin: '0 0 12px', fontSize: 13 }}>Create a role to define a specific set of permissions for your team.</p>
              <button className="btn btn-primary btn-sm" onClick={openCreateRole}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Plus size={14} strokeWidth={2.5} /> Create First Role
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {customRoleEntries.map(([key, def]) => {
                const permCount = def.permissions ? Object.values(def.permissions).filter(Boolean).length : 0
                const totalPerms = groups.reduce((sum, g) => sum + g.permissions.length, 0)
                const count = usersPerRole[key] || 0
                return (
                  <div key={key} style={{
                    padding: '18px 20px', border: '1px solid var(--border)', borderRadius: 12,
                    background: 'var(--surface)',
                    transition: 'box-shadow 0.15s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <h4 style={{ margin: '0 0 4px', fontSize: 15 }}>{def.name}</h4>
                        <span style={{ fontSize: 11, color: 'var(--text-light)', fontFamily: 'monospace' }}>{key}</span>
                      </div>
                      <span className="badge badge-warning" style={{ fontSize: 12 }}>{count} user{count !== 1 ? 's' : ''}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                      <div>
                        <strong style={{ color: 'var(--primary)' }}>{permCount}</strong> / {totalPerms} permissions
                      </div>
                    </div>

                    {/* Permission summary chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
                      {groups.map(g => {
                        const groupEnabled = g.permissions.filter(p => def.permissions?.[p.key]).length
                        if (!groupEnabled) return null
                        return (
                          <span key={g.group} style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 20,
                            background: 'rgba(59,130,246,0.1)', color: 'var(--primary)', fontWeight: 600,
                          }}>
                            {g.group} ({groupEnabled}/{g.permissions.length})
                          </span>
                        )
                      })}
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEditRole(key, def)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: 1 }}>
                        <Pencil size={12} /> Edit
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => openDuplicateRole(key, def)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Duplicate role">
                        <Copy size={12} />
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => deleteCustomRole(key, def.name)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                        title="Delete role">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Role Defaults Tab ────────────────────────────────────────────── */}
      {tab === 'role-defaults' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>Role Default Permissions</h3>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                Set the base permissions for built-in roles. Users without custom overrides inherit these.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline btn-sm" onClick={() => setRoleDraft(JSON.parse(JSON.stringify(roles)))}
                disabled={!roleHasChanges || roleSaving} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <RotateCcw size={13} strokeWidth={2} /> Reset
              </button>
              <button className="btn btn-primary btn-sm" onClick={saveRoleDefaults}
                disabled={!roleHasChanges || roleSaving} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {roleSaving
                  ? <span className="spin" style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} />
                  : <Save size={13} strokeWidth={2} />}
                {roleSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>

          {roleSaved && (
            <div style={{ background: 'var(--success-light)', color: 'var(--success)', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
              Role defaults saved and synced across the system.
            </div>
          )}

          {Object.keys(BUILT_IN_LABELS).map(role => (
            <div key={role} style={{ marginBottom: 24 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`badge ${roleBadgeClass(role)}`}>{BUILT_IN_LABELS[role]}</span>
                Default Permissions
              </h4>
              <PermissionGrid
                groups={groups}
                perms={roleDraft[role] || {}}
                onChange={(updates) => {
                  setRoleDraft(prev => ({
                    ...prev,
                    [role]: { ...prev[role], ...updates },
                  }))
                  setRoleSaved(false)
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Edit User Modal ──────────────────────────────────────────────── */}
      {editModal && (
        <Modal title="Edit User Account" onClose={() => setEditModal(false)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setEditModal(false)} disabled={editSaving}>Cancel</button>
            <SaveBtn loading={editSaving} onClick={saveEdit}>Save</SaveBtn>
          </>}>
          <div className="form-group">
            <label>Full Name *</label>
            <input value={editForm.fullName} onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))} autoFocus />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Role</label>
              <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                {allRoleOptions.map(r => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Branch</label>
              <select value={editForm.branchId} onChange={e => setEditForm(f => ({ ...f, branchId: e.target.value }))}>
                <option value="">No branch</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>New Password <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>(leave blank to keep current)</span></label>
            <input type="password" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
          </div>
          {editError && <div className="error-message">{editError}</div>}
        </Modal>
      )}

      {/* ── Per-User Permissions Modal ────────────────────────────────────── */}
      {permModal && permUser && (
        <Modal
          title={`Permissions — ${permUser.fullName}`}
          onClose={() => setPermModal(false)}
          size="lg"
          footer={<>
            <button className="btn btn-outline" onClick={resetPerms} disabled={permSaving}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <RotateCcw size={13} /> Reset to Role Defaults
            </button>
            <button className="btn btn-primary" onClick={savePerms} disabled={permSaving}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {permSaving
                ? <span className="spin" style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} />
                : <Save size={13} />}
              {permSaving ? 'Saving…' : 'Apply Permissions'}
            </button>
          </>}
        >
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Username:</span> <strong>{permUser.username}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Role:</span> <span className={`badge ${roleBadgeClass(permUser.role)}`}>{roleLabel(permUser.role, customRoles)}</span></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Branch:</span> <strong>{branchMap[permUser.branchId] || 'None'}</strong></div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            Toggle permissions for this user. Items marked <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 11 }}>CUSTOM</span> differ from their role's defaults.
          </p>
          <PermissionGrid
            groups={groups}
            perms={permDraft}
            roleDefaults={roles[permUser.role]}
            onChange={handlePermChange}
            showResetHint
          />
        </Modal>
      )}

      {/* ── Create / Edit Custom Role Modal ──────────────────────────────── */}
      {crModal && (
        <Modal
          title={crEditKey ? `Edit Role — ${crName}` : 'Create Custom Role'}
          onClose={() => setCrModal(false)}
          size="lg"
          footer={<>
            <button className="btn btn-outline" onClick={() => setCrModal(false)} disabled={crSaving}>Cancel</button>
            <SaveBtn loading={crSaving} onClick={saveCustomRole}>
              {crEditKey ? 'Save Changes' : 'Create Role'}
            </SaveBtn>
          </>}
        >
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Role Name *</label>
            <input
              value={crName}
              onChange={e => setCrName(e.target.value)}
              placeholder="e.g. Sales Representative, Stock Keeper"
              autoFocus
            />
            {crName.trim() && !crEditKey && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-light)' }}>
                Key: <code style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 3 }}>
                  {crName.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')}
                </code>
              </p>
            )}
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            Select which permissions this role should have access to:
          </p>

          <PermissionGrid
            groups={groups}
            perms={crPerms}
            onChange={(updates) => setCrPerms(prev => ({ ...prev, ...updates }))}
          />

          {crError && <div className="error-message" style={{ marginTop: 12 }}>{crError}</div>}
        </Modal>
      )}
    </div>
  )
}
