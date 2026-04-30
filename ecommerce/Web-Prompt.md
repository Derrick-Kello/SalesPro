Build a scalable multi-tenant eCommerce web application for a boutique business that operates multiple physical branches, each with its own brand identity, but shares a single backend, database, and inventory system.

## Core Requirements

The system must support multiple storefronts under subdomains such as:

* odeneho.marketplace.gh
* madepa.marketplace.gh

Each subdomain represents a different boutique branch with:

* Unique branding (logo, colors, typography)
* Slight UI layout differences
* Branch-specific product visibility (filtered from a shared inventory system)

The application must automatically detect the active branch based on the request hostname (subdomain) and dynamically configure the UI and data accordingly without requiring separate deployments.

---

## Architecture

### Frontend

* Use Next.js (App Router preferred) deployed on Cloudflare Pages
* Use Tailwind CSS for styling with dynamic theming support
* Implement a clean component-based architecture with reusable UI

### Backend (Already Exists)

* Assume an existing API and database
* The frontend should integrate via REST or GraphQL
* All data must be filtered by `branch_id` or `branch_slug`

---

## Multi-Tenant Logic

Implement a utility to extract the branch slug from the hostname:

Example:

* odeneho.marketplace.gh → "odeneho"
* madepa.marketplace.gh → "madepa"

Fallback:

* Support query param override (?branch=odeneho) for development
* Support localhost subdomains (e.g., odeneho.localhost)

---

## Branch Configuration System

Create a dynamic configuration system:

Data model:

From already existing Model but for client side of the ecommerce

At runtime:

* Fetch branch config from backend
* Store in global state (Context or Zustand)
* Apply branding dynamically across the app

---

## UI / Theming

* Use Tailwind with CSS variables for dynamic theming

* Example:
  --primary-color
  --secondary-color

* Support multiple layout variants:

  * grid-based boutique
  * minimal luxury
  * modern card layout

* Components that should be theme-aware:

  * Navbar
  * Buttons
  * Product cards
  * Checkout UI

---

## Product & Inventory Integration

* Fetch products from existing backend

* Filter by branch:
   The actual Branches saved in the Inventory but now we want to create it for only two main branches(Odeneho and Madepa)

* Support:

  * Categories
  * Variants (sizes, colors)
  * Stock availability

---

## Cart & Checkout System

* Local cart state (persist in localStorage)
* Cart tied to branch (cannot mix items across branches)
* Checkout flow:

  * Shipping info
  * Order summary
  * Payment step

---

## Payment Integration

Integrate African-friendly payment gateways:

* Paystack 

Requirements:

* Initialize payment with backend
* Pass branch_id, order_id, and user details
* Handle callback/redirect verification
* Show success/failure UI

---

## Routing

* Use dynamic routing:
  /products
  /products/[id]
  /cart
  /checkout

* Ensure all routes respect branch context

---

## Performance & Edge

* Optimize for Cloudflare edge delivery
* Use caching where appropriate
* Avoid unnecessary API calls

---

## Security

* Validate branch on backend (do not trust frontend only)
* Secure payment verification server-side
* Sanitize all inputs

---

## Development & Testing

Support:

* ?branch=odeneho query param override
* localhost subdomain testing:
  odeneho.localhost:3000

---

## Deployment

* Deploy on Cloudflare Pages
* Configure wildcard domain:
  *.marketplace.gh
* All subdomains point to same app

---

## Deliverables

* Clean, scalable folder structure
* Reusable hooks:

  * useBranch()
  * useTheme()
* Global state management for branch config
* Fully working UI for at least 2 branch variants
* Payment integration flow
* Documentation for adding new branches without redeploying

---

## Goal

The final system should behave like a white-label boutique platform where new branches can be added by simply inserting a new record in the database, and the system automatically provisions a branded storefront via subdomain without code changes.
