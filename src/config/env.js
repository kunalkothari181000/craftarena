import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  syncTriggerToken: process.env.SYNC_TRIGGER_TOKEN || 'craftarena_default_token',

  optigo: {
    apiUrl: process.env.OPTIGO_API_URL || 'https://powerapi.optigoapps.com/api/cron/data/v1/daily/OYlJ6W0EIaPNj0KQhus7Nc4JrwIf01AE/1',
    baseDomain: process.env.OPTIGO_BASE_DOMAIN || 'https://powerapi.optigoapps.com',
    bearerToken: process.env.OPTIGO_BEARER_TOKEN || ''
  },

  shopify: {
    shopDomain: process.env.SHOPIFY_SHOP_DOMAIN || '',
    accessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '',
    apiVersion: process.env.SHOPIFY_API_VERSION || '2024-10',
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET || ''
  },

  cron: {
    priceSync: process.env.PRICE_SYNC_CRON || '0 */3 * * *',
    catalogueSync: process.env.CATALOGUE_SYNC_CRON || '0 2 * * *'
  }
};

