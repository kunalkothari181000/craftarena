import db from '../db/database.js';

export function handleGetStatus(req, res) {
  try {
    const productCount = db.prepare(`SELECT COUNT(*) as count FROM products`).get().count;
    const variantCount = db.prepare(`SELECT COUNT(*) as count FROM variants`).get().count;
    const orderCount = db.prepare(`SELECT COUNT(*) as count FROM orders`).get().count;
    const recentLogs = db.prepare(`SELECT * FROM sync_logs ORDER BY id DESC LIMIT 10`).all();

    return res.status(200).json({
      status: 'ONLINE',
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        totalProducts: productCount,
        totalVariants: variantCount,
        totalOrdersSynced: orderCount
      },
      recentSyncs: recentLogs
    });
  } catch (err) {
    return res.status(500).json({ status: 'ERROR', error: err.message });
  }
}

