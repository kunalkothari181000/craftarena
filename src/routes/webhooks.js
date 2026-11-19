import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { syncOptigoCustomer, createOptigoOrder, cancelOptigoOrder } from '../services/optigoClient.js';
import db from '../db/database.js';

/**
 * Verify Shopify Webhook HMAC Signature
 */
export function verifyShopifyWebhook(req) {
  const secret = config.shopify.webhookSecret;
  if (!secret) return true; // Bypass verification if secret not configured during dev

  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  if (!hmacHeader) return false;

  const rawBody = req.rawBody || JSON.stringify(req.body);
  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
}

/**
 * Handle orders/create from Shopify
 */
export async function handleOrderCreate(req, res) {
  if (!verifyShopifyWebhook(req)) {
    return res.status(401).json({ error: 'Invalid HMAC signature' });
  }

  const order = req.body;
  console.log(`\n[Webhook orders/create] Received Order #${order.order_number || order.name} (${order.id})`);

  try {
    // 1. Resolve Customer ERP ID
    let erpCustomerId = 2098; // Fallback default retail customer ID
    if (order.customer) {
      const existingCustomer = db.prepare(`SELECT erp_customer_id FROM customers WHERE shopify_customer_id = ?`).get(String(order.customer.id));

      if (existingCustomer?.erp_customer_id) {
        erpCustomerId = existingCustomer.erp_customer_id;
      } else {
        console.log(`[Order Sync] Registering customer in Optigo ERP first...`);
        const syncRes = await syncOptigoCustomer({
          shopifyCustomerId: order.customer.id,
          firstName: order.customer.first_name,
          lastName: order.customer.last_name,
          email: order.customer.email,
          phone: order.customer.phone,
          address: order.shipping_address || order.billing_address
        });

        if (syncRes.systemId) {
          erpCustomerId = Number(syncRes.systemId);
          db.prepare(`
            INSERT INTO customers (shopify_customer_id, erp_customer_id, system_id, email, phone, first_name, last_name)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(shopify_customer_id) DO UPDATE SET erp_customer_id = excluded.erp_customer_id
          `).run(
            String(order.customer.id),
            erpCustomerId,
            syncRes.systemId,
            order.customer.email || '',
            order.customer.phone || '',
            order.customer.first_name || '',
            order.customer.last_name || ''
          );
        }
      }
    }

    // 2. Map Line Items
    const lineItems = (order.line_items || []).map(item => {
      const taxLines = (item.tax_lines || []).map(t => {
        let type = 'CGST';
        const title = (t.title || '').toUpperCase();
        if (title.includes('SGST') || title.includes('STATE')) type = 'SGST';
        else if (title.includes('IGST') || title.includes('INTEGRATED')) type = 'IGST';

        return {
          tax_type: type,
          tax_rate: (parseFloat(t.rate) || 0.015) * 100,
          tax_amount: parseFloat(t.price) || 0
        };
      });

      // Default jewellery GST if not explicitly split: 1.5% CGST + 1.5% SGST
      const fallbackTaxLines = [
        { tax_type: 'CGST', tax_rate: 1.5, tax_amount: (parseFloat(item.price) * item.quantity * 0.015) },
        { tax_type: 'SGST', tax_rate: 1.5, tax_amount: (parseFloat(item.price) * item.quantity * 0.015) }
      ];

      return {
        Ecom_line_item_id: `gid://Shopify/LineItem/${item.id}`,
        variant_id: `gid://Shopify/ProductVariant/${item.variant_id}`,
        article_no: item.sku || 'UNKNOWN_SKU',
        hsn_code: '71131910',
        quantity: item.quantity,
        unit_price: parseFloat(item.price),
        discount_amount: parseFloat(item.total_discount || '0'),
        tax_lines: taxLines.length > 0 ? taxLines : fallbackTaxLines,
        final_amount: parseFloat(item.price) * item.quantity - parseFloat(item.total_discount || '0')
      };
    });

    // 3. Map Addresses
    const shipping = order.shipping_address || {};
    const billing = order.billing_address || shipping;

    const billingAddress = {
      line1: billing.address1 || 'Line 1',
      line2: billing.address2 || null,
      city: billing.city || 'City',
      state: billing.province || billing.state || 'State',
      country: billing.country || 'India',
      postal_code: billing.zip || '000000'
    };

    const shippingAddress = {
      line1: shipping.address1 || billingAddress.line1,
      line2: shipping.address2 || billingAddress.line2,
      city: shipping.city || billingAddress.city,
      state: shipping.province || shipping.state || billingAddress.state,
      country: shipping.country || billingAddress.country,
      postal_code: shipping.zip || billingAddress.postal_code
    };

    // 4. Map Order Summary
    const orderSummary = {
      subtotal_amount: parseFloat(order.current_subtotal_price || order.subtotal_price || '0'),
      discount_total: parseFloat(order.total_discounts || '0'),
      tax_total: parseFloat(order.total_tax || '0'),
      shipping_amount: parseFloat(order.total_shipping_price_set?.shop_money?.amount || '0'),
      grand_total: parseFloat(order.current_total_price || order.total_price || '0')
    };

    // 5. Map Payment
    const payment = [
      {
        payment_method: order.gateway || (order.payment_gateway_names?.[0]) || 'ONLINE',
        transaction_id: order.id ? `TXN_${order.id}` : 'MANUAL',
        paid_amount: orderSummary.grand_total,
        payment_status: (order.financial_status || 'PAID').toUpperCase(),
        paid_at: order.processed_at || order.created_at || new Date().toISOString()
      }
    ];

    // 6. Build Final Optigo Order Payload
    const optigoPayload = {
      source: 'SHOPIFY',
      ecom_order_id: String(order.id),
      order_number: String(order.order_number || order.name),
      created_at: order.created_at || new Date().toISOString(),
      updated_at: order.updated_at || new Date().toISOString(),
      financial_status: (order.financial_status || 'PAID').toUpperCase(),
      fulfillment_status: (order.fulfillment_status || 'UNFULFILLED').toUpperCase(),
      currency: order.currency || 'INR',
      currency_rate: 1.0,
      customer: {
        external_id: String(order.customer?.id || 'GUEST'),
        erp_customer_id: erpCustomerId
      },
      billing_address: billingAddress,
      shipping_address: shippingAddress,
      order_items: lineItems,
      order_summary: orderSummary,
      payment,
      remarks: order.note || 'Synced from Shopify Website'
    };

    // 7. Dispatch to Optigo ERP
    console.log(`[Order Sync] Sending Order #${order.order_number} to Optigo /api/Order/CreateOrder...`);
    const result = await createOptigoOrder(optigoPayload);

    // 8. Record in database
    db.prepare(`
      INSERT INTO orders (shopify_order_id, order_number, optigo_order_no, financial_status, fulfillment_status, grand_total, raw_shopify_order, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shopify_order_id) DO UPDATE SET
        optigo_order_no = excluded.optigo_order_no,
        financial_status = excluded.financial_status,
        fulfillment_status = excluded.fulfillment_status,
        synced_at = excluded.synced_at
    `).run(
      String(order.id),
      String(order.order_number || order.name),
      result.optigoOrderNo || null,
      order.financial_status || 'PAID',
      order.fulfillment_status || 'UNFULFILLED',
      orderSummary.grand_total,
      JSON.stringify(order),
      new Date().toISOString()
    );

    console.log(`[Order Sync Success] Order #${order.order_number} recorded with OptigoOrderNo: ${result.optigoOrderNo}`);
    return res.status(200).json({ success: true, optigoOrderNo: result.optigoOrderNo });

  } catch (err) {
    console.error(`[Order Sync Error on #${order?.order_number}]:`, err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Handle orders/cancelled from Shopify
 */
export async function handleOrderCancel(req, res) {
  if (!verifyShopifyWebhook(req)) {
    return res.status(401).json({ error: 'Invalid HMAC signature' });
  }

  const order = req.body;
  console.log(`\n[Webhook orders/cancelled] Order #${order.order_number || order.name}`);

  try {
    const result = await cancelOptigoOrder({
      ecomOrderId: order.id,
      orderNumber: order.order_number || order.name,
      cancelledAt: order.cancelled_at,
      reason: order.cancel_reason,
      remarks: 'Cancelled via Shopify'
    });

    db.prepare(`
      UPDATE orders SET financial_status = 'CANCELLED' WHERE shopify_order_id = ?
    `).run(String(order.id));

    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error(`[Order Cancel Error]:`, err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

