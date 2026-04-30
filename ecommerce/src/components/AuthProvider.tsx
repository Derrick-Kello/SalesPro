"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import type { ShopperUser } from "@/lib/types";

interface StoredUser extends ShopperUser {
	password: string;
}

interface AuthContextValue {
	user: ShopperUser | null;
	isAuthenticated: boolean;
	isHydrated: boolean;
	signup: (input: { name: string; email: string; password: string }) => { ok: boolean; error?: string };
	login: (input: { email: string; password: string }) => { ok: boolean; error?: string };
	logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USERS_KEY = "salespro:auth:users";
const SESSION_KEY = "salespro:auth:session";

function makeId() {
	return `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toPublicUser(stored: StoredUser): ShopperUser {
	const { password: _pw, ...user } = stored;
	return user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<ShopperUser | null>(null);
	const [isHydrated, setHydrated] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			const raw = window.localStorage.getItem(SESSION_KEY);
			if (raw) {
				const parsed = JSON.parse(raw) as ShopperUser;
				if (parsed?.id && parsed?.email) setUser(parsed);
			}
		} catch {
			setUser(null);
		}
		setHydrated(true);
	}, []);

	const signup = useCallback<AuthContextValue["signup"]>(({ name, email, password }) => {
		const cleanName = name.trim();
		const cleanEmail = email.trim().toLowerCase();
		const cleanPassword = password.trim();
		if (!cleanName || !cleanEmail || !cleanPassword) {
			return { ok: false, error: "Name, email and password are required." };
		}
		if (cleanPassword.length < 6) {
			return { ok: false, error: "Password must be at least 6 characters." };
		}
		try {
			const rawUsers = window.localStorage.getItem(USERS_KEY);
			const users = rawUsers ? (JSON.parse(rawUsers) as StoredUser[]) : [];
			if (users.some((u) => u.email === cleanEmail)) {
				return { ok: false, error: "An account with this email already exists." };
			}
			const stored: StoredUser = {
				id: makeId(),
				name: cleanName,
				email: cleanEmail,
				password: cleanPassword,
				createdAt: new Date().toISOString(),
			};
			const publicUser = toPublicUser(stored);
			window.localStorage.setItem(USERS_KEY, JSON.stringify([...users, stored]));
			window.localStorage.setItem(SESSION_KEY, JSON.stringify(publicUser));
			setUser(publicUser);
			return { ok: true };
		} catch {
			return { ok: false, error: "Could not create account right now." };
		}
	}, []);

	const login = useCallback<AuthContextValue["login"]>(({ email, password }) => {
		const cleanEmail = email.trim().toLowerCase();
		const cleanPassword = password.trim();
		if (!cleanEmail || !cleanPassword) {
			return { ok: false, error: "Email and password are required." };
		}
		try {
			const rawUsers = window.localStorage.getItem(USERS_KEY);
			const users = rawUsers ? (JSON.parse(rawUsers) as StoredUser[]) : [];
			const match = users.find((u) => u.email === cleanEmail && u.password === cleanPassword);
			if (!match) return { ok: false, error: "Invalid email or password." };
			const publicUser = toPublicUser(match);
			window.localStorage.setItem(SESSION_KEY, JSON.stringify(publicUser));
			setUser(publicUser);
			return { ok: true };
		} catch {
			return { ok: false, error: "Could not log in right now." };
		}
	}, []);

	const logout = useCallback(() => {
		if (typeof window !== "undefined") {
			window.localStorage.removeItem(SESSION_KEY);
		}
		setUser(null);
	}, []);

	const value = useMemo<AuthContextValue>(
		() => ({
			user,
			isAuthenticated: Boolean(user),
			isHydrated,
			signup,
			login,
			logout,
		}),
		[user, isHydrated, signup, login, logout]
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth() must be used inside <AuthProvider>");
	return ctx;
}

