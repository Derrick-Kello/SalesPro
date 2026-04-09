// Single source of truth for all permission keys, groups, labels, and role defaults.

const PERMISSION_GROUPS = [
  {
    group: "Dashboard",
    permissions: [
      { key: "dashboard.view", label: "View Dashboard Overview" },
    ],
  },
  {
    group: "Products",
    permissions: [
      { key: "products.view", label: "View Products" },
      { key: "products.create", label: "Create / Import Products" },
      { key: "products.edit", label: "Edit Products" },
      { key: "products.delete", label: "Delete Products" },
    ],
  },
  {
    group: "Inventory",
    permissions: [
      { key: "inventory.view", label: "View Inventory" },
      { key: "inventory.adjust", label: "Adjust Stock Levels" },
    ],
  },
  {
    group: "Transfers",
    permissions: [
      { key: "transfers.view", label: "View Transfers" },
      { key: "transfers.create", label: "Create Transfers" },
      { key: "transfers.delete", label: "Delete Transfers" },
    ],
  },
  {
    group: "Sales & POS",
    permissions: [
      { key: "pos.access", label: "Use Point of Sale" },
      { key: "sales.view", label: "View Sales History" },
      { key: "sales.cancel", label: "Cancel Sales" },
      { key: "sales.delete", label: "Delete Sales" },
    ],
  },
  {
    group: "Branches",
    permissions: [
      { key: "branches.view", label: "View Branches" },
      { key: "branches.create", label: "Create Branches" },
      { key: "branches.edit", label: "Edit Branches" },
      { key: "branches.deactivate", label: "Deactivate Branches" },
    ],
  },
  {
    group: "Warehouses",
    permissions: [
      { key: "warehouses.view", label: "View Warehouses" },
      { key: "warehouses.create", label: "Create Warehouses" },
      { key: "warehouses.edit", label: "Edit Warehouses" },
      { key: "warehouses.deactivate", label: "Deactivate Warehouses" },
    ],
  },
  {
    group: "Expenses",
    permissions: [
      { key: "expenses.view", label: "View Expenses" },
      { key: "expenses.create", label: "Create Expenses" },
      { key: "expenses.edit", label: "Edit Expenses" },
      { key: "expenses.delete", label: "Delete Expenses" },
      { key: "expense_categories.manage", label: "Manage Expense Categories" },
    ],
  },
  {
    group: "Customers",
    permissions: [
      { key: "customers.view", label: "View Customers" },
      { key: "customers.create", label: "Create Customers" },
      { key: "customers.edit", label: "Edit Customers" },
      { key: "customers.delete", label: "Delete Customers" },
    ],
  },
  {
    group: "Suppliers",
    permissions: [
      { key: "suppliers.view", label: "View Suppliers" },
      { key: "suppliers.create", label: "Create Suppliers" },
      { key: "suppliers.edit", label: "Edit Suppliers" },
      { key: "suppliers.delete", label: "Delete Suppliers" },
    ],
  },
  {
    group: "Users",
    permissions: [
      { key: "users.view", label: "View Users" },
      { key: "users.create", label: "Create Users" },
      { key: "users.edit", label: "Edit Users" },
      { key: "users.deactivate", label: "Deactivate Users" },
    ],
  },
  {
    group: "Reports",
    permissions: [
      { key: "reports.view", label: "View Reports" },
    ],
  },
  {
    group: "Settings",
    permissions: [
      { key: "settings.access", label: "Access Settings" },
    ],
  },
];

const ALL_KEYS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

// Sensible defaults for each role. ADMIN is always granted everything.
const ROLE_DEFAULTS = {
  MANAGER: {
    "dashboard.view": true,
    "products.view": true,
    "products.create": true,
    "products.edit": true,
    "products.delete": false,
    "inventory.view": true,
    "inventory.adjust": true,
    "transfers.view": true,
    "transfers.create": true,
    "transfers.delete": false,
    "pos.access": true,
    "sales.view": true,
    "sales.cancel": true,
    "sales.delete": false,
    "branches.view": true,
    "branches.create": false,
    "branches.edit": false,
    "branches.deactivate": false,
    "warehouses.view": true,
    "warehouses.create": false,
    "warehouses.edit": false,
    "warehouses.deactivate": false,
    "expenses.view": true,
    "expenses.create": true,
    "expenses.edit": true,
    "expenses.delete": true,
    "expense_categories.manage": false,
    "customers.view": true,
    "customers.create": true,
    "customers.edit": true,
    "customers.delete": false,
    "suppliers.view": true,
    "suppliers.create": true,
    "suppliers.edit": true,
    "suppliers.delete": false,
    "users.view": true,
    "users.create": false,
    "users.edit": false,
    "users.deactivate": false,
    "reports.view": true,
    "settings.access": false,
  },
  CASHIER: {
    "dashboard.view": false,
    "products.view": true,
    "products.create": false,
    "products.edit": false,
    "products.delete": false,
    "inventory.view": false,
    "inventory.adjust": false,
    "transfers.view": false,
    "transfers.create": false,
    "transfers.delete": false,
    "pos.access": true,
    "sales.view": true,
    "sales.cancel": false,
    "sales.delete": false,
    "branches.view": false,
    "branches.create": false,
    "branches.edit": false,
    "branches.deactivate": false,
    "warehouses.view": false,
    "warehouses.create": false,
    "warehouses.edit": false,
    "warehouses.deactivate": false,
    "expenses.view": false,
    "expenses.create": false,
    "expenses.edit": false,
    "expenses.delete": false,
    "expense_categories.manage": false,
    "customers.view": true,
    "customers.create": true,
    "customers.edit": false,
    "customers.delete": false,
    "suppliers.view": false,
    "suppliers.create": false,
    "suppliers.edit": false,
    "suppliers.delete": false,
    "users.view": false,
    "users.create": false,
    "users.edit": false,
    "users.deactivate": false,
    "reports.view": false,
    "settings.access": false,
  },
};

module.exports = { PERMISSION_GROUPS, ALL_KEYS, ROLE_DEFAULTS };
