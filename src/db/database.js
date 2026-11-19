import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'sync.db');
const db = new DatabaseSync(dbPath);

// Initialize tables
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS products (
    designno TEXT PRIMARY KEY,
    shopify_product_id TEXT,
    title TEXT,
    category TEXT,
    brand TEXT,
    raw_data TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS variants (
    articleno TEXT PRIMARY KEY,
    designno TEXT,
    shopify_variant_id TEXT,
    shopify_inventory_item_id TEXT,
    metalcolor TEXT,
    metalquality TEXT,
    jewllerysize TEXT,
    grosswt REAL,
    metalwt REAL,
    goldamount REAL,
    diamondamount REAL,
    makingcharge REAL,
    taxamount REAL,
    price REAL,
    saleprice REAL,
    stockquantity INTEGER,
    updated_at TEXT,
    last_synced_at TEXT,
    FOREIGN KEY (designno) REFERENCES products (designno)
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shopify_customer_id TEXT UNIQUE,
    erp_customer_id INTEGER,
    system_id INTEGER,
    email TEXT,
    phone TEXT,
    first_name TEXT,
    last_name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shopify_order_id TEXT UNIQUE,
    order_number TEXT,
    optigo_order_no TEXT,
    financial_status TEXT,
    fulfillment_status TEXT,
    grand_total REAL,
    raw_shopify_order TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    synced_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_type TEXT,
    status TEXT,
    total_items INTEGER,
    updated_items INTEGER,
    details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

export default db;
