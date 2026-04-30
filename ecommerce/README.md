# SalesPro Marketplace — Multi-Tenant Storefront

A scalable Next.js (App Router) storefront that turns a single deployment into
many branded boutiques. Each subdomain (`odeneho.marketplace.gh`,
`madepa.marketplace.gh`, …) becomes its own storefront with its own theme,
products and inventory — all sharing the existing SalesPro POS backend.

```
┌─────────────────────┐         ┌──────────────────────┐
│ odeneho.marketplace │ ──┐     │                      │
├─────────────────────┤   │     │   Express API        │
│ madepa.marketplace  │ ──┼──▶  │   /api/storefront/*  │ ─▶ Postgres (Prisma)
├─────────────────────┤   │     │                      │
│ <new>.marketplace   │ ──┘     └──────────────────────┘
└─────────────────────┘             ▲   ▲
                                    │   │
                                    │   └─ Paystack verification (server-side)
                                    └──── Branch table + Inventory tables
```

## How multi-tenancy works

1. **`src/proxy.ts`** runs on every request. It picks the active branch slug
   from (in priority order):
   - the `?branch=` query string (dev override),
   - the first hostname label (`odeneho.marketplace.gh` → `odeneho`,
     `odeneho.localhost:3000` → `odeneho`),
   - the `branch_slug` cookie (sticky from a previous override),
   - `NEXT_PUBLIC_DEFAULT_BRANCH_SLUG` (fallback during local dev).
2. The slug is forwarded as the `x-branch-slug` header to all server handlers.
3. **`src/lib/serverBranch.ts → getActiveBranch()`** reads the slug, fetches the
   branch row from the backend, and merges it with the local profile (theme,
   tagline, layout) defined in `src/lib/branches.ts`.
4. **`src/components/BrandedShell.tsx`** writes the branch's theme tokens onto
   the wrapper as CSS variables. All Tailwind utilities and reusable
   `btn-brand`/`card-brand`/`chip-brand` classes restyle automatically.

## How inventory stays in sync

- All product listings hit `GET /api/storefront/branch/:slug/products`. The
  backend filters to products that are either explicitly assigned to that
  branch or assigned to no branch (i.e. visible everywhere). Per-branch stock
  comes from the `branch_inventory` table.
- Checkout posts to `POST /api/storefront/branch/:slug/orders`, which:
  1. **Re-resolves the branch from the URL slug** — the client-supplied slug
     is treated as untrusted input and re-validated against the database.
  2. **Re-prices every line server-side** from the `products` table.
  3. **Re-verifies the Paystack reference** against Paystack's API using the
     server's secret key, ensuring the captured amount matches the rebuilt
     grand total before any inventory mutation.
  4. **Creates a `Sale` row** attributed to a system `__storefront__` user,
     decrements `branch_inventory` for that branch, and writes a `Payment` row
     with the Paystack reference. Web orders therefore appear in the existing
     dashboard reports and inventory views with no further integration.

## Local development

### 1. Run the backend

```bash
cd backend && npm run dev
# → POS server running on http://localhost:3000
```

The storefront API mounts at `http://localhost:3000/api/storefront`. It is
public — no authentication header required — but every write is re-validated
on the server.

### 2. Configure the storefront

Copy the example env file and fill in your Paystack public key:

```bash
cd ecommerce
cp .env.example .env.local
# edit NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY with your test key
```

Variables:

| Variable                          | Purpose                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_BACKEND_URL`         | Base URL of the Express API (e.g. `http://localhost:3000/api`) |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Paystack public key (only used as metadata for inline JS today) |
| `NEXT_PUBLIC_DEFAULT_BRANCH_SLUG` | Fallback slug when no subdomain is detected                  |
| `NEXT_PUBLIC_CURRENCY`            | Storefront currency (must be supported by Paystack)          |

### 3. Run the storefront

```bash
npm run dev
# Default: http://localhost:3000 (uses NEXT_PUBLIC_DEFAULT_BRANCH_SLUG)
```

Test the multi-tenant flow without setting up DNS:

- **Query override (works everywhere):**
  - http://localhost:3000?branch=odeneho
  - http://localhost:3000?branch=madepa
- **Localhost subdomains (best for visual QA):** modern browsers resolve
  `*.localhost` automatically.
  - http://odeneho.localhost:3000
  - http://madepa.localhost:3000

The `branch_slug` cookie sticks the active branch after the first
`?branch=` request, so you can navigate normally.

## Adding a new branch storefront (no redeploy needed)

The marketplace can provision a new boutique just by creating a row in the
existing `branches` table. The storefront will work with the default theme as
soon as DNS resolves — no code or rebuild required.

To customise the new branch's look:

1. Insert a `Branch` row in the SalesPro admin (e.g. **Aseda**).
2. (Optional) Add an entry to `BRANCH_PROFILES` in
   `src/lib/branches.ts`:

   ```ts
   aseda: {
     slug: "aseda",
     displayName: "Aseda Atelier",
     tagline: "Bridal couture for the chosen day.",
     logoMark: "As",
     heroEyebrow: "Bridal",
     heroTitle: "Heirlooms in the making.",
     heroSubtitle: "Made-to-measure bridal pieces from our Kumasi studio.",
     layout: "minimal-luxury",
     theme: {
       primary: "#3f1d38",
       primaryForeground: "#fdf2f8",
       secondary: "#fdf2f8",
       accent: "#be185d",
       background: "#fffafd",
       foreground: "#1c0d18",
       muted: "#7a4760",
       border: "#f0d3e5",
       radius: "0.75rem",
       fontHeading: "var(--font-display)",
       fontBody: "var(--font-body)",
     },
   },
   ```

3. Point `aseda.marketplace.gh` to the same Pages deployment.
   Wildcard DNS (`*.marketplace.gh`) handles new branches automatically.
4. Assign products to the branch in the SalesPro admin (**Products → Edit →
   Branch visibility**) or leave them unassigned to make them visible at every
   storefront.

## Theming primer

Every theme exposes the same set of CSS variables, so reusable utilities pick
up branch colours automatically:

| Variable                   | Used by                                  |
| -------------------------- | ---------------------------------------- |
| `--color-primary`          | `btn-brand`, navbar mark, accent badges  |
| `--color-primary-foreground` | text on primary backgrounds            |
| `--color-secondary`        | `btn-brand-soft`, hero washes, chips     |
| `--color-accent`           | callouts, highlights, "view" links       |
| `--color-background` / `--color-foreground` | page chrome             |
| `--color-muted`            | helper text, captions                    |
| `--color-border`           | dividers, card outlines                  |
| `--radius`                 | corner radius across cards/chips/buttons |

Three layout variants are available for the product grid:

- `boutique-grid` — tight, gallery-style 2/3/4-up grid (Odeneho)
- `minimal-luxury` — generous spacing, 1/2/3-up grid (Madepa)
- `modern-card` — denser 2/3/4-up grid for fast browsing

Use `useBranch()` and `useTheme()` from `src/hooks` to read the active
branch/theme inside any client component.

## Deployment (Cloudflare Pages)

```bash
npm run preview   # local OpenNext preview
npm run deploy    # build + upload to Cloudflare
```

Configure DNS on `marketplace.gh`:

```
*.marketplace.gh   CNAME   <your-pages-project>.pages.dev
```

All subdomains hit the same worker; the proxy header logic routes each request
to the correct branded storefront.

## Project layout

```
ecommerce/
├── src/
│   ├── proxy.ts                 # subdomain → branch slug
│   ├── app/
│   │   ├── layout.tsx           # root layout, providers, branded shell
│   │   ├── page.tsx             # branded home
│   │   ├── products/            # listing + detail
│   │   ├── cart/                # branch-scoped cart
│   │   └── checkout/            # form + success
│   ├── components/              # ui (theme-aware)
│   ├── hooks/                   # useBranch, useCart, useTheme
│   └── lib/                     # api, branches, money, types
└── README.md (this file)
```
