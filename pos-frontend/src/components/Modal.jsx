import { X } from 'lucide-react'

export default function Modal({ title, onClose, children, footer, size }) {
  return (
    <div className="modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal-content${size === 'lg' ? ' modal-lg' : ''}`}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
