# Requirements Document

## Introduction

This feature extends the existing POS system to support multiple branches and physical warehouses. Currently the system operates as a single-location store with a global inventory. This feature introduces a Branch model (a retail location where sales happen) and a Warehouse model (a physical storage location that may or may not be tied to a branch). Inventory becomes per-branch, users are assigned to a branch, and sales and expenses are scoped to a branch. An Admin can view data across all branches or filter by a specific branch. Stock transfers between branches and warehouses are also supported.

## Glossary

- **Branch**: A retail location where sales are conducted. Has its own inventory, staff, and expenses.
- **Warehouse**: A physical storage location owned by the company. May be linked to a Branch or operate independently as a central warehouse.
- **BranchInventory**: The stock record for a specific product at a specific branch, replacing the global Inventory model.
- **StockTransfer**: A record of stock movement from one Branch or Warehouse to another.
- **Admin**: A user with the ADMIN role who has full system access across all branches.
- **Manager**: A user with the MANAGER role who manages operations within their assigned branch.
- **Cashier**: A user with the CASHIER role who processes sales at their assigned branch.
- **Branch_API**: The backend Express router handling `/api/branches` endpoints.
- **Warehouse_API**: The backend Express router handling `/api/warehouses` endpoints.
- **Transfer_API**: The backend Express router handling `/api/transfers` endpoints.
- **Report_API**: The backend Express router handling `/api/reports` endpoints.
- **Register**: The cashier-facing POS register component used to process sales.
- **Dashboard**: The admin/manager-facing web interface for managing the POS system.
- **Branch_Selector**: A UI control in the Dashboard header that allows an Admin to filter all views by a specific branch or view all branches combined.
- **Migration**: A Prisma database migration script that transforms the existing schema to the new multi-branch schema.

---

## Requirements

### Requirement 1: Branch Management

**User Story:** As an Admin, I want to create and manage branches, so that I can represent each physical retail location in the system.

#### Acceptance Criteria

1. THE Branch_API SHALL expose CRUD endpoints at `/api/branches` accessible only to users with the ADMIN role.
2. WHEN an Admin submits a valid branch creation request with `name`, `location`, and optional `phone`, THE Branch_API SHALL persist the branch and return the created branch record with `id`, `name`, `location`, `phone`, `isActive`, and `createdAt`.
3. WHEN an Admin requests the list of branches, THE Branch_API SHALL return all branches ordered by `name` ascending.
4. WHEN an Admin updates a branch, THE Branch_API SHALL apply only the provided fields and return the updated branch record.
5. WHEN an Admin deactivates a branch by setting `isActive` to `false`, THE Branch_API SHALL retain all historical sales, expenses, and inventory records associated with that branch.
6. IF a branch creation request is missing the required `name` field, THEN THE Branch_API SHALL return a 400 status with a descriptive error message.
7. IF a non-Admin user attempts to access any `/api/branches` endpoint, THEN THE Branch_API SHALL return a 403 status.

---

### Requirement 2: Warehouse Management

**User Story:** As an Admin, I want to create and manage warehouses, so that I can track physical storage locations and optionally link them to a branch.

#### Acceptance Criteria

1. THE Warehouse_API SHALL expose CRUD endpoints at `/api/warehouses` accessible only to users with the ADMIN role.
2. WHEN an Admin submits a valid warehouse creation request with `name` and `location`, THE Warehouse_API SHALL persist the warehouse and return the created record with `id`, `name`, `location`, `branchId`, `isActive`, and `createdAt`.
3. WHERE a warehouse is linked to a branch via `branchId`, THE Warehouse_API SHALL validate that the referenced branch exists before persisting.
4. WHEN an Admin requests the list of warehouses, THE Warehouse_API SHALL return all warehouses including the associated branch name when `branchId` is set.
5. IF a warehouse creation request references a non-existent `branchId`, THEN THE Warehouse_API SHALL return a 404 status with a descriptive error message.
6. IF a non-Admin user attempts to access any `/api/warehouses` endpoint, THEN THE Warehouse_API SHALL return a 403 status.

---

### Requirement 3: Database Migration to Multi-Branch Schema

**User Story:** As a developer, I want the database schema migrated to support multi-branch operations, so that all data is correctly scoped to a branch without losing existing records.

#### Acceptance Criteria

1. THE Migration SHALL add a `Branch` table with columns `id`, `name`, `location`, `phone`, `isActive`, and `createdAt`.
2. THE Migration SHALL add a `Warehouse` table with columns `id`, `name`, `location`, `branchId` (nullable FK to Branch), `isActive`, and `createdAt`.
3. THE Migration SHALL add a nullable `branchId` foreign key column to the `users` table referencing the `Branch` table.
4. THE Migration SHALL add a non-nullable `branchId` foreign key column to the `sales` table referencing the `Branch` table, defaulting existing rows to a seed "Default Branch".
5. THE Migration SHALL add a nullable `branchId` foreign key column to the `expenses` table referencing the `Branch` table.
6. THE Migration SHALL create a `branch_inventory` table with columns `id`, `branchId`, `productId`, `quantity`, `lowStockAlert`, and `supplier`, with a unique constraint on `(branchId, productId)`.
7. THE Migration SHALL migrate all existing `inventory` rows into `branch_inventory` associated with the seed "Default Branch".
8. WHEN the Migration completes, THE Migration SHALL preserve all existing `Sale`, `SaleItem`, `Payment`, `Expense`, and `Customer` records without data loss.

---

### Requirement 4: User Branch Assignment

**User Story:** As an Admin, I want to assign users to a specific branch, so that their sales and inventory access are automatically scoped to that branch.

#### Acceptance Criteria

1. WHEN an Admin creates or updates a user, THE Dashboard SHALL present a branch selector dropdown populated with all active branches.
2. WHEN a user is saved with a `branchId`, THE Branch_API SHALL persist the `branchId` on the user record.
3. WHEN a Cashier or Manager logs in, THE Register SHALL read the `branchId` from the authenticated user's session token.
4. IF a user has no `branchId` assigned and attempts to process a sale, THEN THE Register SHALL display an error message indicating the user is not assigned to a branch.

---

### Requirement 5: Per-Branch Inventory

**User Story:** As a Manager, I want to manage inventory independently per branch, so that stock levels at one branch do not affect another.

#### Acceptance Criteria

1. THE Dashboard Inventory view SHALL display only the `BranchInventory` records belonging to the currently authenticated user's branch, for Managers and Cashiers.
2. WHEN an Admin views inventory without a branch filter, THE Dashboard SHALL display inventory aggregated across all branches with a branch name column.
3. WHEN an Admin applies a branch filter via the Branch_Selector, THE Dashboard SHALL display only the `BranchInventory` records for the selected branch.
4. WHEN a Cashier processes a sale, THE Register SHALL decrement stock from the `BranchInventory` record matching the cashier's assigned `branchId` and the sold `productId`.
5. IF a product's `BranchInventory` quantity at the cashier's branch is less than the requested sale quantity, THEN THE Register SHALL prevent the sale and display a stock-unavailable error.
6. WHEN a `BranchInventory` quantity falls at or below its `lowStockAlert` threshold, THE Dashboard SHALL include that item in the low-stock alerts for the relevant branch.

---

### Requirement 6: Branch-Scoped Sales

**User Story:** As an Admin, I want all sales to be tagged with a branch, so that I can report on revenue per branch.

#### Acceptance Criteria

1. WHEN a Cashier processes a sale, THE Register SHALL automatically attach the cashier's `branchId` to the sale record.
2. WHEN an Admin requests the sales list without a branch filter, THE Branch_API SHALL return all sales across all branches including the branch name.
3. WHEN an Admin applies a branch filter, THE Branch_API SHALL return only sales where `branchId` matches the filter value.
4. WHEN a Manager requests the sales list, THE Branch_API SHALL return only sales where `branchId` matches the manager's assigned branch.

---

### Requirement 7: Branch-Scoped Expenses

**User Story:** As a Manager, I want expenses to be associated with my branch, so that branch-level profit and loss reporting is accurate.

#### Acceptance Criteria

1. WHEN a Manager or Admin creates an expense, THE Dashboard SHALL present a branch selector pre-populated with the creator's assigned branch.
2. WHEN an expense is saved, THE Branch_API SHALL persist the `branchId` on the expense record.
3. WHEN a Manager views expenses, THE Dashboard SHALL display only expenses where `branchId` matches the manager's assigned branch.
4. WHEN an Admin views expenses without a branch filter, THE Dashboard SHALL display all expenses across all branches including the branch name column.

---

### Requirement 8: Stock Transfers Between Branches and Warehouses

**User Story:** As a Manager or Admin, I want to transfer stock between branches and warehouses, so that inventory can be redistributed without manual adjustments.

#### Acceptance Criteria

1. THE Transfer_API SHALL expose a `POST /api/transfers` endpoint accessible to users with the ADMIN or MANAGER role.
2. WHEN a valid transfer request is submitted with `fromBranchId` or `fromWarehouseId`, `toBranchId` or `toWarehouseId`, `productId`, and `quantity`, THE Transfer_API SHALL atomically decrement the source `BranchInventory` and increment the destination `BranchInventory` within a single database transaction.
3. THE Transfer_API SHALL persist a `StockTransfer` record with `id`, `productId`, `quantity`, `fromBranchId`, `fromWarehouseId`, `toBranchId`, `toWarehouseId`, `transferredById`, and `createdAt`.
4. WHEN an Admin or Manager requests the transfer history at `GET /api/transfers`, THE Transfer_API SHALL return transfers ordered by `createdAt` descending, including product name and branch/warehouse names.
5. IF the source location does not have sufficient quantity to fulfill the transfer, THEN THE Transfer_API SHALL return a 400 status with a descriptive error and SHALL NOT modify any inventory records.
6. IF the `productId` does not exist in the source location's inventory, THEN THE Transfer_API SHALL return a 404 status with a descriptive error.

---

### Requirement 9: Admin Branch Selector and Filtered Overview Stats

**User Story:** As an Admin, I want a branch selector in the dashboard header, so that I can view stats and data for a specific branch or all branches combined.

#### Acceptance Criteria

1. THE Branch_Selector SHALL be visible in the Dashboard header only to users with the ADMIN role.
2. THE Branch_Selector SHALL present an "All Branches" option and one option per active branch.
3. WHEN an Admin selects a branch in the Branch_Selector, THE Dashboard SHALL pass a `?branchId=` query parameter to all data-fetching API calls including overview stats, sales, inventory, and expenses.
4. WHEN an Admin selects "All Branches", THE Dashboard SHALL fetch data without a `?branchId=` filter, returning combined data across all branches.
5. WHEN the Report_API receives a `?branchId=` query parameter on `/api/reports/overview-stats`, THE Report_API SHALL filter all aggregations (sales, expenses, low stock, weekly chart, top products, payment breakdown) to the specified branch.
6. WHEN the Report_API receives no `?branchId=` parameter, THE Report_API SHALL return aggregated data across all branches unchanged.

---

### Requirement 10: Branch and Warehouse Management Pages (Frontend)

**User Story:** As an Admin, I want dedicated management pages for branches and warehouses in the dashboard, so that I can perform CRUD operations from the UI.

#### Acceptance Criteria

1. THE Dashboard SHALL include a "Branches" page accessible only to users with the ADMIN role, reachable from the sidebar navigation.
2. THE Dashboard SHALL include a "Warehouses" page accessible only to users with the ADMIN role, reachable from the sidebar navigation.
3. WHEN an Admin opens the Branches page, THE Dashboard SHALL display a table of all branches with columns for name, location, phone, status, and action buttons for edit and deactivate.
4. WHEN an Admin opens the Warehouses page, THE Dashboard SHALL display a table of all warehouses with columns for name, location, linked branch, status, and action buttons for edit and deactivate.
5. WHEN an Admin submits the branch creation form with valid data, THE Dashboard SHALL call `POST /api/branches` and refresh the branch list on success.
6. WHEN an Admin submits the warehouse creation form with valid data, THE Dashboard SHALL call `POST /api/warehouses` and refresh the warehouse list on success.

---

### Requirement 11: Reports Branch Filter

**User Story:** As an Admin or Manager, I want to filter reports by branch, so that I can analyze performance for a specific location.

#### Acceptance Criteria

1. THE Dashboard Reports section SHALL include a branch filter dropdown for users with the ADMIN role.
2. WHEN an Admin selects a branch in the Reports branch filter, THE Dashboard SHALL pass `?branchId=` to all report API calls including daily, weekly, product performance, cashier performance, and inventory reports.
3. WHEN a Manager views reports, THE Dashboard SHALL automatically apply the manager's `branchId` to all report API calls without displaying the branch filter dropdown.
4. WHEN the Report_API receives a `?branchId=` parameter on any report endpoint, THE Report_API SHALL scope all queries to records where `branchId` matches the provided value.
