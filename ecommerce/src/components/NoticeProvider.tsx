"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type NoticeType = "info" | "error" | "success";
type Notice = { id: number; message: string; type: NoticeType };

const NoticeContext = createContext<{
	notify: (message: string, type?: NoticeType) => void;
} | null>(null);

let nextId = 1;

export function NoticeProvider({ children }: { children: ReactNode }) {
	const [items, setItems] = useState<Notice[]>([]);

	const dismiss = useCallback((id: number) => {
		setItems((prev) => prev.filter((n) => n.id !== id));
	}, []);

	const notify = useCallback((message: string, type: NoticeType = "info") => {
		const id = nextId++;
		setItems((prev) => [...prev, { id, message, type }]);
		window.setTimeout(() => dismiss(id), 3200);
	}, [dismiss]);

	const value = useMemo(() => ({ notify }), [notify]);

	return (
		<NoticeContext.Provider value={value}>
			{children}
			<div style={{ position: "fixed", top: 14, right: 14, zIndex: 1200, display: "grid", gap: 8 }}>
				{items.map((n) => (
					<div
						key={n.id}
						role="status"
						style={{
							minWidth: 240,
							maxWidth: 360,
							padding: "10px 12px",
							borderRadius: 10,
							background: "var(--color-background)",
							border: `1px solid ${n.type === "error" ? "#fecaca" : n.type === "success" ? "#bbf7d0" : "#bfdbfe"}`,
							borderLeft: `4px solid ${n.type === "error" ? "#dc2626" : n.type === "success" ? "#16a34a" : "#2563eb"}`,
							boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
							fontSize: 13,
						}}
					>
						<div style={{ display: "flex", alignItems: "start", gap: 8 }}>
							<div style={{ flex: 1 }}>{n.message}</div>
							<button
								type="button"
								onClick={() => dismiss(n.id)}
								style={{ border: "none", background: "transparent", cursor: "pointer", color: "#6b7280" }}
								aria-label="Dismiss"
							>
								×
							</button>
						</div>
					</div>
				))}
			</div>
		</NoticeContext.Provider>
	);
}

export function useNotice() {
	const ctx = useContext(NoticeContext);
	if (!ctx) throw new Error("useNotice() must be used inside NoticeProvider");
	return ctx;
}

