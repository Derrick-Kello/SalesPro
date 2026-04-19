# Implementation Plan: Branch & Warehouse Management

## Overview

Extend the POS system from a single-location model to a multi-branch architecture. The implementation proceeds in layers: database schema first, then backend routes, then frontend context and components, and finally wiring everything together.

## Tasks

- [ ] 1. Database schema migration and seed
  - [ ] 1.1 Update Prisma schema with Branch, Warehouse, BranchInventory, and StockTransfer models
    - Add `Branch` model with `id`, `name`, `location`, `phone`, `isActive`, `createdAt`
    - Add `Warehouse` model with `id`, `name`, `location`, `branchId` (nullable FK), `isActive`, `createdAt`
    - Add `BranchInventory` model with `id`, `branchId`, `productId`, `quantity`, `lowStockAlert`, `supplier`; unique constraint on `(branchId, productId)`
    - Add `StockTransfer` model with `id`, `productId`, `quantity`, `fromBranchId`, `fromWarehouseId`, `toBranchId`, `toWarehouseId`, `transferredById`, `note`, `createdAt`
    - Add nullable `branchId` FK to `User` model
    - Add `branchId` FK to `Sale` model (nullable initially for migration)
    - Add nullable `branchId` FK to `Expense` model
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ] 1.2 Write and run Prisma migration with data backfill
    - Create migration SQL that seeds a "Default Branch" row
    - Backfill `sales.branchId` to the Default Branch id for all existing rows
    - Copy all `inventory` rows into `branch_inventory` associated with the Default Branch
    - Make `sales.branchId` NOT NULL after backfill
    - _Requirements: 3.4, 3.7, 3.8_

- [ ] 2. Backend utility and auth updates
  - [ ] 2.1 Create `src/utils/branchScope.js` helper
    - Implement `resolveBranchId(req)`: ADMIN returns `parseInt(req.query.branchId)` or `undefined`; MANAGER/CASHIER returns `req.user.branchId`
    - _Requirements: 5.1, 6.2, 6.3, 6.4, 9.5_

  - [ ]* 2.2 Write unit tests for `resolveBranchId`
    - Test ADMIN with `?branchId=2` returns `2`
    - Test ADMIN without query param returns `undefined`
    - Test MANAGER returns `req.user.branchId`
    - _Requirements: 5.1, 6.4_

  - [ ] 2.3 Update `src/routes/auth.js` login handler to include `branchId` in JWT payload
    - Add `branchId: user.branchId ?? null` to `jwt.sign()` call
    - Include `branchId` in the user object returned to the client
    - _Requirements: 4.3_

- [ ] 3. Branch API route
  - [ ] 3.1 Create `src/routes/branches.js` with full CRUD
    - `GET /` — list all branches ordered by `name` asc; ADMIN only
    - `POST /` — create branch; validate `name` required; return 400 if missing; return 201 with full record
    - `PUT /:id` — partial update; return updated record
    - `DELETE /:id` — set `isActive = false`; preserve all related records
    - Return 403 for non-ADMIN via `authorize('ADMIN')` middleware
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 3.2 Write property test for branch creation response completeness
    - **Property 6: Branch creation response completeness**
    - **Validates: Requirements 1.2**
    - Generate random valid branch payloads; assert response contains `id`, `name`, `location`, `phone`, `isActive` (true), `createdAt`

  - [ ]* 3.3 Write unit tests for branch route validation
    - Test missing `name` returns 400 with descriptive error
    - Test non-ADMIN returns 403
    - _Requirements: 1.6, 1.7_

  - [ ] 3.4 Register branches route in `src/server.js`
    - `app.use('/api/branches', branchRoutes)`
    - _Requirements: 1.1_

- [ ] 4. Warehouse API route
  - [ ] 4.1 Create `src/routes/warehouses.js` with CRUD
    - `GET /` — list all warehouses including associated branch name; ADMIN only
    - `POST /` — validate `name` required; validate `branchId` exists if provided (return 404 if not); return 201
    - `PUT /:id` — partial update
    - Return 403 for non-ADMIN
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 4.2 Write property test for warehouse branch reference validity
    - **Property 7: Warehouse branch reference validity**
    - **Validates: Requirements 2.3, 2.5**
    - Generate warehouse creation requests with existing and non-existing `branchId` values; assert existing → 201, non-existing → 404

  - [ ] 4.3 Register warehouses route in `src/server.js`
    - `app.use('/api/warehouses', warehouseRoutes)`
    - _Requirements: 2.1_

- [ ] 5. Stock Transfer API route
  - [ ] 5.1 Create `src/routes/transfers.js`
    - `POST /` — validate required fields (`productId`, `quantity > 0`, source, destination); check source `BranchInventory` exists (404 if not); check sufficient quantity (400 if not); run atomic `prisma.$transaction` to decrement source and increment destination; persist `StockTransfer` record; return 201
    - `GET /` — return transfers ordered by `createdAt` desc including product name and branch/warehouse names
    - Accessible to ADMIN and MANAGER
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 5.2 Write property test for transfer atomicity
    - **Property 1: Transfer atomicity — inventory conservation**
    - **Validates: Requirements 8.2, 8.5**
    - Generate two branch inventory records with random quantities (source ≥ transfer qty); execute transfer; assert `sourceBefore + destBefore === sourceAfter + destAfter`

  - [ ]* 5.3 Write property test for transfer rejection on insufficient stock
    - **Property 2: Transfer rejection on insufficient stock**
    - **Validates: Requirements 8.5**
    - Generate source inventory with quantity Q; submit transfer with quantity > Q; assert 400 response and both inventory records unchanged

  - [ ] 5.4 Register transfers route in `src/server.js`
    - `app.use('/api/transfers', transferRoutes)`
    - _Requirements: 8.1_

- [ ] 6. Checkpoint — Ensure all backend route tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Update existing backend routes for branch scoping
  - [ ] 7.1 Update `src/routes/users.js` to accept `branchId` on create and update
    - Add `branchId` to the create/update Prisma calls
    - _Requirements: 4.1, 4.2_

  - [ ] 7.2 Update `src/routes/inventory.js` to use `BranchInventory`
    - Replace all `prisma.inventory` references with `prisma.branchInventory`
    - Apply `resolveBranchId(req)` to scope GET queries
    - Scope stock adjustment `PUT /:productId/adjust` to the resolved `branchId`
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ] 7.3 Update `src/routes/sales.js` for branch scoping
    - On `POST /`: validate `req.user.branchId` is set; return 400 if not; attach `branchId` to sale create; replace `inventory` decrements with `branchInventory` decrements scoped to `req.user.branchId`
    - On `GET /`: apply `resolveBranchId(req)` to filter; include `branch { name }` in response
    - On `PUT /:id/cancel`: restore stock to `branchInventory` instead of `inventory`
    - _Requirements: 5.4, 5.5, 6.1, 6.2, 6.3, 6.4_

  - [ ]* 7.4 Write property test for sale stock decrement
    - **Property 5: Sale stock decrement round-trip**
    - **Validates: Requirements 5.4**
    - Generate branch inventory with quantity Q ≥ sale quantity S; process sale; assert new quantity === Q - S

  - [ ] 7.5 Update `src/routes/expenses.js` for branch scoping
    - On `POST /`: attach `branchId` from `req.user.branchId` (or body for ADMIN)
    - On `GET /`: apply `resolveBranchId(req)` to filter; include `branch { name }` in response
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ] 7.6 Update `src/routes/reports.js` to accept `?branchId=` on all endpoints
    - Apply `resolveBranchId(req)` and pass `branchId` filter to all queries in `overview-stats`, `daily`, `weekly`, `products`, `cashiers`, and `inventory` endpoints
    - Invalidate cache key per `branchId` so filtered and unfiltered stats are cached separately
    - _Requirements: 9.5, 9.6, 11.4_

  - [ ]* 7.7 Write property test for branch scoping invariant (non-admin)
    - **Property 3: Branch scoping invariant for non-admin users**
    - **Validates: Requirements 5.1, 6.4, 7.3**
    - Generate records across N branches; simulate MANAGER request for branch B; assert all returned records have `branchId === B`

  - [ ]* 7.8 Write property test for admin branch filter correctness
    - **Property 4: Admin branch filter correctness**
    - **Validates: Requirements 6.3, 9.3, 9.5, 11.4**
    - Generate records across multiple branches; simulate ADMIN request with `?branchId=B`; assert all returned records have `branchId === B`

- [ ] 8. Checkpoint — Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Frontend: BranchContext and Navbar selector
  - [ ] 9.1 Create `src/context/BranchContext.jsx`
    - Expose `selectedBranchId` (null = all branches) and `setSelectedBranchId`
    - Export `useBranch()` hook
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ] 9.2 Update `src/components/Navbar.jsx` to add BranchSelector for ADMIN
    - Fetch active branches from `GET /api/branches` on mount
    - Render a `<select>` with "All Branches" + one option per branch; only visible when `user.role === 'ADMIN'`
    - On change, call `setSelectedBranchId` from `useBranch()`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ] 9.3 Wrap `Dashboard.jsx` in `BranchProvider` and add new sidebar items
    - Import and wrap content in `<BranchProvider>`
    - Add "Branches" and "Warehouses" sidebar items with `roles: ['ADMIN']`
    - Add "Transfers" sidebar item with `roles: ['ADMIN', 'MANAGER']`
    - Wire new keys in `renderSection`
    - _Requirements: 10.1, 10.2_

- [ ] 10. Frontend: Branch and Warehouse management pages
  - [ ] 10.1 Create `src/components/dashboard/Branches.jsx`
    - Table with columns: name, location, phone, status, actions (edit / deactivate)
    - Create/edit modal form with `name`, `location`, `phone` fields
    - On submit call `POST /api/branches` or `PUT /api/branches/:id`; refresh list on success
    - _Requirements: 10.1, 10.3, 10.5_

  - [ ] 10.2 Create `src/components/dashboard/Warehouses.jsx`
    - Table with columns: name, location, linked branch, status, actions
    - Create/edit modal form with `name`, `location`, branch dropdown (fetched from `/api/branches`)
    - On submit call `POST /api/warehouses` or `PUT /api/warehouses/:id`; refresh list on success
    - _Requirements: 10.2, 10.4, 10.6_

- [ ] 11. Frontend: Update existing dashboard components for branch scoping
  - [ ] 11.1 Update `src/components/dashboard/Overview.jsx`
    - Read `selectedBranchId` from `useBranch()`
    - Append `?branchId=${selectedBranchId}` to the `/reports/overview-stats` fetch when set
    - _Requirements: 9.3, 9.4, 9.5, 9.6_

  - [ ] 11.2 Update `src/components/dashboard/Inventory.jsx` for BranchInventory
    - Append `?branchId=` from `useBranch()` to inventory API calls
    - Show branch name column when ADMIN views all branches
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ] 11.3 Update `src/components/dashboard/SalesHistory.jsx`
    - Append `?branchId=` from `useBranch()` to sales API calls
    - _Requirements: 6.2, 6.3, 6.4_

  - [ ] 11.4 Update `src/components/dashboard/AllExpenses.jsx`
    - Append `?branchId=` from `useBranch()` to expenses API calls
    - Show branch name column for ADMIN all-branches view
    - _Requirements: 7.3, 7.4_

  - [ ] 11.5 Update `src/components/dashboard/Reports.jsx`
    - Add branch filter dropdown for ADMIN (fetched from `/api/branches`)
    - Append `?branchId=` to all report API calls (daily, weekly, products, cashiers, inventory)
    - For MANAGER, auto-apply `user.branchId` without showing the dropdown
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ] 11.6 Update `src/components/dashboard/Users.jsx`
    - Add branch assignment dropdown populated from `GET /api/branches`
    - Include `branchId` in create/update user API calls
    - _Requirements: 4.1, 4.2_

  - [ ] 11.7 Update `src/components/cashier/Register.jsx` for branch-scoped stock
    - Read `user.branchId` from auth context; display error if not set when attempting a sale
    - Replace global inventory stock check with `BranchInventory` check scoped to `user.branchId`
    - Attach `branchId` to the sale POST body
    - _Requirements: 4.3, 4.4, 5.4, 5.5, 6.1_

- [ ] 12. Frontend: Transfers page
  - [ ] 12.1 Update `src/components/dashboard/CreateTransfer.jsx` (or create if not present)
    - Form fields: source branch/warehouse selector, destination branch/warehouse selector, product selector, quantity
    - On submit call `POST /api/transfers`; show success/error feedback
    - _Requirements: 8.1, 8.2_

  - [ ] 12.2 Create or update `src/components/dashboard/Transfers.jsx` to show transfer history
    - Table with columns: date, product, quantity, from, to, transferred by
    - Fetch from `GET /api/transfers`
    - _Requirements: 8.4_

- [ ] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use **fast-check** and should run a minimum of 100 iterations each
- All transfer inventory mutations run inside `prisma.$transaction()` with a 15s timeout
- The `resolveBranchId` helper centralizes branch scoping logic across all route files
- Cache keys in `reports.js` must be namespaced by `branchId` to avoid serving stale filtered data
