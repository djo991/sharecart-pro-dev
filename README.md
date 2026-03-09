# ShareCart Pro

ShareCart Pro is a Shopify App that allows merchants to offer "Share Cart" functionality to their customers. Customers can generate a unique link to their cart, share it with others, and anyone who clicks the link will instantly load those items into their own cart.

The app tracks shares, clicks (impressions), and successful orders generated from shared carts to provide actionable analytics to the merchant.

## Technologies Used

- **Framework**: Shopify App Remix / React Router v7
- **UI**: Shopify Polaris v13 & App Bridge
- **Database**: PostgreSQL (via Supabase) with Prisma ORM
- **Extensions**:
  - Theme App Extension (injects the "Share Cart" button and restores carts)
  - Customer Account Extension (allows customers to view, pause, and delete their shared carts)

## Core Features

1. **Cart Sharing**: Users click "Share Cart" to generate a short, unique `?_sc=TOKEN` tracking link.
2. **App Proxy Authentication**: Secure API endpoints for storefront widgets using Shopify's App Proxy.
3. **Analytics**: Tracks events (creates, clicks, purchases) and aggregates them into a merchant-facing dashboard.
4. **GDPR Compliant**: Implements `SHOP_REDACT` and `CUSTOMERS_REDACT` webhooks to securely purge PII (Personally Identifiable Information) while retaining anonymous aggregate analytics.
5. **Customer Accounts**: Customers can manage their active share links directly from the native Shopify Customer Account page.
6. **Customizable URL Parameters**: Merchants can automatically append UTM tags or discount codes to shared links.

## Environment Variables

To run the app locally or in production, ensure the following environment variables are set in your `.env` file:

```env
SHOPIFY_API_KEY="your_api_key_here"
SHOPIFY_APP_URL="https://your-ngrok-or-cloudflare-url.com"

# Supabase PostgreSQL connection
# DATABASE_URL should point to the connection pooler (port 6543) for general Prisma queries
DATABASE_URL="postgresql://postgres.kbxclbfvyhwvlnuksbfl:[PASSWORD]@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# DIRECT_URL should point to the direct DB connection (port 5432) for Prisma migrations
DIRECT_URL="postgresql://postgres.kbxclbfvyhwvlnuksbfl:[PASSWORD]@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"
```

## Setup & Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Database Setup**
   If starting from scratch, synchronize the Prisma schema with your database:
   ```bash
   npx prisma db push
   # or
   npx prisma migrate dev
   ```

3. **Start the Local Environment**
   ```bash
   shopify app dev
   ```
   *Note: Shopify's CLI handles local tunneling (via Cloudflare) and automatically updates your `SHOPIFY_APP_URL` in the environment.*

## Project Structure

- `app/routes/`: Main application pages, API endpoints, and webhook handlers. 
  - `api.share.jsx`: App Proxy endpoint for creating share links.
  - `api.event.jsx`: App Proxy endpoint for logging impressions/clicks.
  - `webhooks.jsx`: Handles GDPR redactions, app uninstalls, and order tracking.
- `app/models/`: Database abstraction layer (Prisma queries) and business logic.
- `extensions/sharecart-theme/`: Liquid and JavaScript for the storefront button and cart replacement logic.
- `extensions/sharecart-customer-account/`: Remote DOM React components for the customer account page integration.
- `prisma/schema.prisma`: Database schema definition.

## Security & Best Practices

- **API Security**: Storefront APIs utilize Shopify's App Proxy (`authenticate.public.appProxy`) to ensure requests genuinely originate from the merchant's storefront.
- **CORS**: Customer Account Extension APIs strictly validate `Access-Control-Allow-Origin` against known Shopify domains.
- **Database Connection**: Uses Supabase connection pooling for scalability in serverless environments.
- **Logging**: Uses `console.debug` for verbose server logging to avoid spamming production logs, while fatal errors use `console.error`.
