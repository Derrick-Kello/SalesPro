# POS System

A full Point of Sale system with a Node.js/Express/Prisma backend and a plain HTML/CSS/JS frontend.

## Setup

### Backend

```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev
```

### Frontend

Open `frontend/index.html` in a browser, or serve it with any static file server:

```bash
npx serve frontend
```

## Default Login Credentials

| Role    | Username | Password    |
|---------|----------|-------------|
| Admin   | admin    | admin123    |
| Manager | manager  | manager123  |
| Cashier | cashier  | cashier123  |

## Structure

```
backend/
  prisma/
    schema.prisma     - Database schema
    seed.js           - Sample data
  src/
    middleware/auth.js
    routes/           - auth, products, inventory, sales, customers, reports, users
    prisma/client.js
    server.js
  .env

frontend/
  css/style.css
  js/
    api.js            - Fetch wrapper
    auth.js           - Login / logout / route guard
    pos.js            - Cashier register
    dashboard.js      - Admin/manager dashboard
  index.html          - Login page
  pos.html            - Cashier screen
  dashboard.html      - Admin/manager dashboard
```
