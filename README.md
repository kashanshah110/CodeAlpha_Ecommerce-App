# NovaStore

NovaStore is an HTML/CSS/vanilla JavaScript storefront and administration dashboard served by an Express API backed by MongoDB and Mongoose.

## Requirements

- Node.js 20 or newer and npm
- MongoDB locally, or a MongoDB Atlas connection string

## Setup

1. Open a terminal in `NovaStore/backend` and install the backend dependencies:

   ```powershell
   npm install
   ```

2. Configure `backend/.env` with `MONGO_URI` and a random `SESSION_SECRET` of at least 32 characters. **If a local `.env` already exists, do not overwrite it.** Preserve its existing MongoDB and other values, and add or update only the required keys. If there is no `.env`, copy `.env.example` and replace its placeholder secret before starting. Keep `.env` private; it is ignored by git. Generate a secret in PowerShell with:

   ```powershell
   $bytes = New-Object byte[] 48
   [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
   [Convert]::ToBase64String($bytes)
   ```

3. Start the server:

   ```powershell
   npm run dev
   ```

   The server connects to MongoDB before it starts accepting requests. It serves the customer pages at `http://localhost:5000`, the admin dashboard at `http://localhost:5000/admin.html`, and the API under `/api`. Check readiness at `http://localhost:5000/api/health`.

4. Create the first administrator once. In a separate PowerShell terminal in `NovaStore/backend`, enter these commands and provide the requested values when prompted:

   ```powershell
   $env:ADMIN_NAME = Read-Host "Administrator name"
   $env:ADMIN_EMAIL = Read-Host "Administrator email"
   $securePassword = Read-Host "Administrator password (12+ characters)" -AsSecureString
   $env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
   npm run seed:admin
   Remove-Item Env:ADMIN_NAME, Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD
   ```

   The command refuses to run once any administrator exists. Do not add these credentials to frontend files or commit them.

5. Register a customer from the storefront, then sign in at `http://localhost:5000/login.html`. Administrators can sign in there too and use the Admin link in the navigation.

Signed-in customers and administrators can change their password from the **My Profile** page by entering their current password and choosing a new one. Administrators can add product images by selecting a JPEG, PNG, WebP, or GIF image up to 5 MB from their computer; uploads are stored in `frontend/uploads/` and are excluded from git.

### Using VS Code Live Server instead

The Express server is the recommended way to serve the frontend because it keeps the browser and API same-origin. If you use Live Server, set `FRONTEND_ORIGIN` in `backend/.env` to the exact origin it displays (for example `http://127.0.0.1:5500`), and open the site using that same host consistently.

## Security and application behavior

- Passwords are bcrypt-hashed. Browser code does not store passwords or authentication tokens.
- Login uses MongoDB-backed server sessions and an HttpOnly, SameSite cookie. Cookies are Secure in production.
- State-changing API calls require a session-bound CSRF token. Configure the exact frontend origin in `FRONTEND_ORIGIN` if it differs from the API origin.
- All admin APIs independently authenticate and check the current database role.
- Carts are stored per account. The server validates current product data, stock, and quantities and calculates prices and totals.
- Orders store customer contact/address and price snapshots. The included checkout is explicitly sandbox-only: it creates an order and reserves stock but does not collect or process payment.
- Administrators can expand order details and record an externally received payment as paid. This is manual bookkeeping only; no payment credentials are collected or payment processed by NovaStore. Paid orders cannot be cancelled from the dashboard until any external refund has been handled.
- Customers can see their order and payment-recording status in Order History.
- Before taking real payments, configure a payment provider, use its server-side SDK and verified webhooks, reconcile order/payment states, and complete production security and operational review. Do not treat sandbox orders as paid.
- Order cancellation from pending/processing restores reserved stock. Orders and their customer/address snapshots are visible only to the customer who placed them or an administrator.

## Checks

Run `npm run check` in `backend` for JavaScript syntax checks.
