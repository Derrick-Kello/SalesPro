// Lightweight illustrated tile used as a product placeholder. The POS doesn't
// store images yet, so we generate a deterministic gradient + monogram from the
// product name so the grid still looks intentional rather than empty.

interface Props {
	name: string;
	category: string;
	className?: string;
}

const PALETTES: [string, string][] = [
	["#fde68a", "#b45309"],
	["#bbf7d0", "#047857"],
	["#bae6fd", "#0c4a6e"],
	["#fbcfe8", "#9d174d"],
	["#ddd6fe", "#5b21b6"],
	["#fed7aa", "#7c2d12"],
	["#cffafe", "#155e75"],
	["#fecaca", "#7f1d1d"],
];

function hashString(s: string) {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
	return Math.abs(h);
}

export function ProductImage({ name, category, className }: Props) {
	const seed = hashString(`${name}|${category}`);
	const [from, to] = PALETTES[seed % PALETTES.length];
	const initials = name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0])
		.join("")
		.toUpperCase()
		.slice(0, 2) || "·";

	return (
		<div
			className={`relative overflow-hidden ${className || ""}`}
			style={{
				background: `linear-gradient(135deg, ${from}, ${to})`,
				borderRadius: "calc(var(--radius) - 2px)",
			}}
		>
			<div
				className="absolute inset-0 flex items-center justify-center font-display font-semibold text-white/90"
				style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)" }}
			>
				{initials}
			</div>
			<div
				className="absolute bottom-2 left-2 chip-brand"
				style={{ background: "rgba(255,255,255,0.8)", color: "#1c1917", borderColor: "rgba(0,0,0,0.05)" }}
			>
				{category}
			</div>
		</div>
	);
}
