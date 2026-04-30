// Server Component that injects per-branch CSS variables onto the wrapper
// element so Tailwind utilities and `--color-primary` references restyle
// correctly with no client-side flicker.

import type { CSSProperties, ReactNode } from "react";
import { themeToCssVars, type BranchTheme } from "@/lib/branches";

export function BrandedShell({
	theme,
	children,
}: {
	theme: BranchTheme;
	children: ReactNode;
}) {
	const style = themeToCssVars(theme) as unknown as CSSProperties;
	return (
		<div style={style} className="min-h-screen flex flex-col">
			{children}
		</div>
	);
}
