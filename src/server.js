import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { startScheduler } from './jobs/scheduler.js';
import { handleOrderCreate, handleOrderCancel } from './routes/webhooks.js';
import { handleTriggerSync } from './routes/trigger.js';
import { handleGetStatus } from './routes/status.js';
import { handleDashboardHtml, handleTestOptigo, handleTestShopify } from './routes/dashboard.js';

const app = express();

app.use(cors());

// Middleware to capture raw body for HMAC verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

// Home & Admin Dashboard
app.get('/', (req, res) => res.redirect('/admin'));
app.get('/admin', handleDashboardHtml);
app.get('/dashboard', handleDashboardHtml);

// Diagnostics & Control APIs
app.get('/api/admin/test-optigo', handleTestOptigo);
app.get('/api/admin/test-shopify', handleTestShopify);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Sync Status & Dashboard Info
app.get('/api/status', handleGetStatus);

// On-Demand Sync Trigger (Manual URL or button)
app.get('/api/sync/trigger', handleTriggerSync);
app.post('/api/sync/trigger', handleTriggerSync);

// Shopify Webhooks
app.post('/api/webhooks/shopify/orders-create', handleOrderCreate);
app.post('/api/webhooks/shopify/orders-cancel', handleOrderCancel);

// Start server
app.listen(config.port, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 CraftArena Optigo ERP ↔ Shopify Server Online!`);
  console.log(`   Port:            ${config.port}`);
  console.log(`   Environment:     ${config.nodeEnv}`);
  console.log(`   Admin Dashboard: http://localhost:${config.port}/admin`);
  console.log(`   Health Check:    http://localhost:${config.port}/health`);
  console.log(`   Status API:      http://localhost:${config.port}/api/status`);
  console.log(`   Manual Sync:     http://localhost:${config.port}/api/sync/trigger?token=${config.syncTriggerToken}`);
  console.log(`======================================================\n`);

  // Start background cron jobs
  startScheduler();
});

