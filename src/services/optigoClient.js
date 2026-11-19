import { config } from '../config/env.js';

/**
 * Fetch live catalogue from Optigo GET API
 */
export async function fetchOptigoProducts() {
  const url = config.optigo.apiUrl;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Optigo Products API Error: HTTP ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) {
    throw new Error(`Invalid response from Optigo Products API: ${json.message || 'No data array'}`);
  }

  return json.data;
}

/**
 * Generic POST dispatcher that serializes payloads into the mandatory stringified ReqData format
 */
export async function postOptigoReqData(endpointPath, payloadArray) {
  const { baseDomain, bearerToken } = config.optigo;
  const cleanBase = baseDomain.replace(/\/+$/, '');
  const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const fullUrl = `${cleanBase}${cleanPath}`;

  // Optigo Mandatory: Double serialization inside stringified ReqData array
  const stringifiedReqData = JSON.stringify(payloadArray);
  const body = JSON.stringify({
    ReqData: stringifiedReqData
  });

  const headers = {
    'Content-Type': 'application/json'
  };

  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }

  const res = await fetch(fullUrl, {
    method: 'POST',
    headers,
    body
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Optigo POST ${endpointPath} returned non-JSON response (${res.status}): ${text}`);
  }
}

/**
 * Creates or checks customer in Optigo ERP
 */
export async function syncOptigoCustomer({ shopifyCustomerId, firstName, lastName, email, phone, address }) {
  const payload = [
    {
      Evt: 'Customer Create',
      Integration: [
        {
          source: 'SHOPIFY',
          external_id: String(shopifyCustomerId)
        }
      ],
      PersonalInfo: [
        {
          firstname: firstName || 'Valued',
          lastname: lastName || 'Customer',
          emailid: email || '',
          mobileno: phone || ''
        }
      ],
      CustomerAddress: address ? [
        {
          Addresstype: 'SHIPPING',
          Addressline1: address.address1 || '',
          city: address.city || '',
          state: address.province || address.state || '',
          country: address.country || 'India',
          postalcode: address.zip || ''
        }
      ] : []
    }
  ];

  const result = await postOptigoReqData('/api/Customer/CreateCustomer', payload);
  const dt = result?.Data?.DT?.[0];

  return {
    success: dt?.stat === 1,
    customerId: dt?.CustomerId || null,
    systemId: dt?.SystemId || null,
    message: dt?.stat_msg || result?.Message || 'Unknown response',
    raw: result
  };
}

/**
 * Dispatches a Shopify Order to Optigo ERP
 */
export async function createOptigoOrder(orderPayload) {
  const payload = [
    {
      Evt: 'CreateOrder',
      OrderDetails: [orderPayload]
    }
  ];

  const result = await postOptigoReqData('/api/Order/CreateOrder', payload);
  const dt = result?.Data?.DT?.[0];

  return {
    success: dt?.stat === 1,
    optigoOrderNo: dt?.OptigoOrderNo || null,
    orderNumber: dt?.order_number || null,
    ecomOrderId: dt?.ecom_order_id || null,
    message: dt?.stat_msg || result?.Message || 'Unknown response',
    raw: result
  };
}

/**
 * Cancels an order in Optigo ERP
 */
export async function cancelOptigoOrder({ ecomOrderId, orderNumber, cancelledAt, reason, remarks }) {
  const payload = [
    {
      Evt: 'cancelorder',
      OrderDetails: [
        {
          source: 'SHOPIFY',
          Ecom_order_id: String(ecomOrderId),
          order_number: String(orderNumber),
          cancelled_at: cancelledAt || new Date().toISOString(),
          cancel_reason: reason || 'CUSTOMER_REQUEST',
          remarks: remarks || 'Cancelled via Shopify Webhook'
        }
      ]
    }
  ];

  const result = await postOptigoReqData('/api/Order/CancelOrder', payload);
  const dt = result?.Data?.DT?.[0];

  return {
    success: dt?.stat === 1,
    message: dt?.stat_msg || result?.Message || 'Unknown response',
    raw: result
  };
}

