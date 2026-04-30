// Local branding/theme registry for storefront branches.
//
// The backend (Branch table) is the source of truth for which branches exist
// and which products belong to them. This file only adds the *visual* layer
// (logo, colors, layout variant, tagline, font) keyed by slug.
//
// To add a new branch storefront WITHOUT a code change you can:
//   1) Insert a Branch row in the database with the desired name (slug is
//      derived as a kebab-cased version of the name).
//   2) The site will fall back to DEFAULT_THEME below and still render.
// To customise the new branch's look, add an entry to BRANCH_PROFILES.

import type { BranchSlug } from "./types";

export type LayoutVariant = "boutique-grid" | "minimal-luxury" | "modern-card";

export interface BranchTheme {
	primary: string;
	primaryForeground: string;
	secondary: string;
	accent: string;
	background: string;
	foreground: string;
	muted: string;
	border: string;
	radius: string;
	fontHeading: string;
	fontBody: string;
}

export interface BranchProfile {
	slug: BranchSlug;
	displayName: string;
	tagline: string;
	logoMark: string; // short text or initials shown in the navbar pill
	heroEyebrow: string;
	heroTitle: string;
	heroSubtitle: string;
	layout: LayoutVariant;
	theme: BranchTheme;
}

export const DEFAULT_THEME: BranchTheme = {
	primary: "#111111",
	primaryForeground: "#ffffff",
	secondary: "#f5f5f4",
	accent: "#d97706",
	background: "#ffffff",
	foreground: "#0c0a09",
	muted: "#737373",
	border: "#e7e5e4",
	radius: "0.75rem",
	fontHeading: "var(--font-display)",
	fontBody: "var(--font-body)",
};

export const BRANCH_PROFILES: Record<BranchSlug, BranchProfile> = {
	odeneho: {
		slug: "odeneho",
		displayName: "Odeneho Clothing",
		tagline: "Royal threads. Made in Ghana.",
		logoMark: "Od",
		heroEyebrow: "New Season",
		heroTitle: "Heritage tailoring,\nreimagined for today.",
		heroSubtitle:
			"Hand-finished kaftans, kente blends and ceremonial pieces — sourced from the Odeneho atelier and shipped across Ghana.",
		layout: "boutique-grid",
		theme: {
			primary: "#7c2d12",
			primaryForeground: "#fffbeb",
			secondary: "#fef3c7",
			accent: "#b45309",
			background: "#fffaf0",
			foreground: "#1c1917",
			muted: "#78716c",
			border: "#f1ddc1",
			radius: "1rem",
			fontHeading: "var(--font-display)",
			fontBody: "var(--font-body)",
		},
	},
	madepa: {
		slug: "madepa",
		displayName: "Madepa Clothing",
		tagline: "Modern luxury, unapologetic style.",
		logoMark: "Ma",
		heroEyebrow: "Capsule Drop",
		heroTitle: "Quietly bold pieces\nfor everyday icons.",
		heroSubtitle:
			"A curated edit of resort wear, tailored separates and limited collaborations from the Madepa studio in East Legon.",
		layout: "minimal-luxury",
		theme: {
			primary: "#0f172a",
			primaryForeground: "#f8fafc",
			secondary: "#f1f5f9",
			accent: "#c026d3",
			background: "#ffffff",
			foreground: "#0f172a",
			muted: "#64748b",
			border: "#e2e8f0",
			radius: "0.5rem",
			fontHeading: "var(--font-display)",
			fontBody: "var(--font-body)",
		},
	},
};

export function getBranchProfile(slug: BranchSlug | null | undefined): BranchProfile {
	const key = (slug || "").toLowerCase();
	if (key && BRANCH_PROFILES[key]) return BRANCH_PROFILES[key];
	// Synthetic profile for unknown branches — preserves multi-tenancy without
	// requiring a code deploy when a new Branch row is added.
	return {
		slug: key || "default",
		displayName: key ? capitalize(key) : "Marketplace",
		tagline: "Discover what's in store.",
		logoMark: key ? key.slice(0, 2).toUpperCase() : "MP",
		heroEyebrow: "Welcome",
		heroTitle: "Shop the latest\nfrom your local store.",
		heroSubtitle: "Browse curated picks and have them delivered fast.",
		layout: "modern-card",
		theme: DEFAULT_THEME,
	};
}

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Convert a theme object into inline CSS variable declarations for next/script
 *  usage; kept as a helper instead of inline strings in JSX for testability. */
export function themeToCssVars(theme: BranchTheme): Record<string, string> {
	return {
		"--color-primary": theme.primary,
		"--color-primary-foreground": theme.primaryForeground,
		"--color-secondary": theme.secondary,
		"--color-accent": theme.accent,
		"--color-background": theme.background,
		"--color-foreground": theme.foreground,
		"--color-muted": theme.muted,
		"--color-border": theme.border,
		"--radius": theme.radius,
		"--font-heading": theme.fontHeading,
		"--font-body": theme.fontBody,
	};
}
