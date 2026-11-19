# CraftArena - Optigo ERP ↔ Shopify Jewellery Middleware

High-performance, automated synchronization middleware connecting **Optigo ERP** with a **Shopify Jewellery Store**, designed for zero-extra-cost deployment on **Hostinger** (Node.js runtime).

---

## 💎 Features

- **100% Automated Product Sync:** No manual editing needed in Shopify. Design grouping, options, variants, descriptions, and media are auto-generated from Optigo ERP.
- **Dynamic Gold Rate Price Sync:** Blazing-fast delta updates (completes in ~1 second) using Shopify GraphQL bulk APIs whenever gold rates fluctuate.
- **Jewellery-Specific Metafields:** Automatically stores Gross Weight, Net Gold Weight, Purity (14K/18K/22K), Diamond Carats/Clarity/Color, Making Charges, and HSN compliance codes (`71131910`).
- **Real-Time Reverse Order Sync:** Listens to Shopify `orders/create` and `orders/cancelled` webhooks, maps taxes/HSN, and dispatches them to Optigo's REST API using the required stringified `ReqData` encoding.
- **Customer Lifecycle Registration:** Automatically creates customers in Optigo ERP if they don't already exist, linking their `erp_customer_id` before placing orders.
- **On-Demand Manual Sync Trigger:** Exposes a secure URL endpoint that client staff can click/bookmark to refresh prices immediately after updating gold rates in Optigo.

---

## 📁 Project Structure

```
craftarena/
├── data/
│   └── sync.db                  # Embedded SQLite database (zero configuration)
├── src/
│   ├── config/
│   │   └── env.js               # Environment variables configuration
│   ├── db/
│   │   └── database.js          # SQLite connection & schema initialization
│   ├── jobs/
│   │   ├── scheduler.js         # Automated cron schedule (3h prices, nightly catalogue)
│   │   ├── syncCatalogue.js     # Full catalogue synchronization
│   │   └── syncPrices.js        # High-speed gold rate / price & stock delta sync
│   ├── routes/
│   │   ├── status.js            # Server status and sync history
│   │   ├── trigger.js           # On-demand sync endpoint
│   │   └── webhooks.js          # Shopify orders/create and cancel listeners
│   ├── scripts/
│   │   ├── runSync.js           # CLI runner (npm run sync:prices / sync:catalogue)
│   │   └── testFetch.js         # Direct test against Optigo GET API
│   ├── services/
│   │   ├── normalizer.js        # Cleans titles, colors, stone specs, and malformed JSON
│   │   ├── optigoClient.js      # REST API client with stringified ReqData formatter
│   │   ├── priceDiffEngine.js   # Detects price and stock changes
│   │   ├── productGrouper.js    # Groups flat ERP records by designno
│   │   └── shopifyClient.js     # Shopify Admin GraphQL API client
│   └── server.js                # Express server entry point
├── ecosystem.config.cjs         # PM2 configuration for Hostinger
├── package.json
└── .env                         # Environment settings (credentials)
```

---

## ⚙️ Configuration (.env)

Open `.env` and fill in your Shopify credentials and Optigo tokens:

```ini
# Server Configuration
PORT=3000
NODE_ENV=production
SYNC_TRIGGER_TOKEN=craftarena_optigo_sync_secret_token_2026

# Optigo ERP Configuration
OPTIGO_API_URL=https://powerapi.optigoapps.com/api/cron/data/v1/daily/<YOUR_INLINE_TOKEN>/1
OPTIGO_BASE_DOMAIN=https://powerapi.optigoapps.com
OPTIGO_BEARER_TOKEN=YOUR_OPTIGO_BEARER_TOKEN

# Shopify Store Credentials
SHOPIFY_SHOP_DOMAIN=your-brand.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_API_VERSION=2024-10
SHOPIFY_WEBHOOK_SECRET=your_shopify_webhook_secret

# Automated Cron Intervals
PRICE_SYNC_CRON="0 */3 * * *"   # Every 3 hours
CATALOGUE_SYNC_CRON="0 2 * * *"  # Nightly at 2:00 AM
```

---

## 🚀 Local Commands

```bash
# 1. Test fetching and grouping live Optigo products
npm run test:fetch

# 2. Run high-speed gold price & stock delta sync
npm run sync:prices

# 3. Run full catalogue sync
npm run sync:catalogue

# 4. Start the server (with webhook receiver and cron scheduler)
npm start
```

---

## 🌐 Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Health check (`{"status": "OK"}`) |
| `GET` | `/api/status` | Real-time database counts (products, variants, orders) & last 10 sync logs |
| `GET/POST`| `/api/sync/trigger?token=...&mode=prices` | On-demand gold price update |
| `GET/POST`| `/api/sync/trigger?token=...&mode=catalogue` | On-demand full catalogue sync |
| `POST` | `/api/webhooks/shopify/orders-create` | Shopify webhook listener for new orders |
| `POST` | `/api/webhooks/shopify/orders-cancel` | Shopify webhook listener for cancelled orders |

---

## ☁️ Hostinger Deployment Guide

### Option A: Hostinger VPS (Recommended - Maximum Speed)
1. Push this project to GitHub (or upload via SSH/SFTP).
2. SSH into your Hostinger VPS.
3. Install dependencies:
   ```bash
   cd /var/www/craftarena
   npm install --production
   ```
4. Start with PM2:
   ```bash
   npm install -g pm2
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup
   ```

### Option B: Hostinger Cloud / Web Hosting (Node.js App Selector)
1. In Hostinger hPanel, go to **Node.js** under Advanced / Applications.
2. Create an application:
   - **Node.js version:** 20.x or 22.x
   - **Application root:** `craftarena`
   - **Application startup file:** `src/server.js`
3. Upload the project files using File Manager or Git.
4. Click **Run NPM Install** in hPanel.
5. Click **Restart Application**.

---

## 🔗 Shopify Webhook Setup

In **Shopify Admin ➔ Settings ➔ Notifications ➔ Webhooks**:
1. **Order Creation:**
   - Event: `Order creation`
   - Format: `JSON`
   - URL: `https://your-hostinger-domain.com/api/webhooks/shopify/orders-create`
   - Webhook API Version: `2024-10`
2. **Order Cancellation:**
   - Event: `Order cancellation`
   - Format: `JSON`
   - URL: `https://your-hostinger-domain.com/api/webhooks/shopify/orders-cancel`

