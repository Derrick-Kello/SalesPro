import type { Metadata } from "next";
import { Geist, Playfair_Display } from "next/font/google";
import "./globals.css";

import { BranchProvider } from "@/components/BranchProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { CartProvider } from "@/components/CartProvider";
import { BrandedShell } from "@/components/BrandedShell";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { NoticeProvider } from "@/components/NoticeProvider";
import { getActiveBranch } from "@/lib/serverBranch";

const sans = Geist({
	variable: "--font-body",
	subsets: ["latin"],
});

const display = Playfair_Display({
	variable: "--font-display",
	subsets: ["latin"],
	weight: ["500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
	const { profile } = await getActiveBranch();
	return {
		title: `${profile.displayName} — ${profile.tagline}`,
		description: profile.heroSubtitle,
	};
}

export default async function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const { slug, profile, record } = await getActiveBranch();
	return (
		<html lang="en">
			<head>
				<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
			</head>
			<body className={`${sans.variable} ${display.variable} antialiased`}>
				<BranchProvider value={{ slug, profile, record, isResolved: Boolean(record) }}>
					<AuthProvider>
						<NoticeProvider>
							<CartProvider>
								<BrandedShell theme={profile.theme}>
									<Navbar />
									<main className="flex-1">{children}</main>
									<Footer />
								</BrandedShell>
							</CartProvider>
						</NoticeProvider>
					</AuthProvider>
				</BranchProvider>
			</body>
		</html>
	);
}
