/**
 * Order Service - UCP Order Capability (dev.ucp.shopping.order)
 * 
 * Maps UCP Order operations to Shopify Orders.
 * Orders are immutable post-checkout with fulfillment tracking.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import type {
  UCPOrder,
  UCPOrderLineItem,
  UCPTotal,
  UCPMetadata,
  UCPExpectation,
  UCPFulfillmentEvent,
  UCPAdjustment,
} from "./types";

// GraphQL fragments
const ORDER_FIELDS = `
  id
  name
  createdAt
  updatedAt
  statusPageUrl
  displayFinancialStatus
  displayFulfillmentStatus
  cancelledAt
  totalPriceSet {
    shopMoney {
      amount
      currencyCode
    }
  }
  subtotalPriceSet {
    shopMoney {
      amount
      currencyCode
    }
  }
  totalTaxSet {
    shopMoney {
      amount
      currencyCode
    }
  }
  totalShippingPriceSet {
    shopMoney {
      amount
      currencyCode
    }
  }
  totalDiscountsSet {
    shopMoney {
      amount
      currencyCode
    }
  }
  totalRefundedSet {
    shopMoney {
      amount
      currencyCode
    }
  }
  lineItems(first: 50) {
    edges {
      node {
        id
        name
        quantity
        sku
        fulfillableQuantity
        fulfillmentStatus
        variant {
          id
          price
          product {
            id
            title
            featuredImage {
              url
            }
          }
        }
        originalUnitPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
    }
  }
  customer {
    id
    email
    firstName
    lastName
    phone
  }
  shippingAddress {
    address1
    address2
    city
    province
    provinceCode
    country
    countryCodeV2
    zip
    phone
    firstName
    lastName
    company
  }
  fulfillments {
    id
    createdAt
    status
    trackingInfo {
      number
      url
      company
    }
    fulfillmentLineItems(first: 50) {
      edges {
        node {
          id
          quantity
          lineItem {
            id
          }
        }
      }
    }
  }
  refunds {
    id
    createdAt
    note
    totalRefundedSet {
      shopMoney {
        amount
        currencyCode
      }
    }
  }
`;

// ===== Transformers =====

function transformShopifyLineItemToUCPOrder(edge: any): UCPOrderLineItem {
  const node = edge.node;
  const variant = node.variant;
  return {
    id: node.id,
    product_id: variant?.product?.id || "",
    variant_id: variant?.id || "",
    quantity: node.quantity,
    title: node.name,
    sku: node.sku,
    image_url: variant?.product?.featuredImage?.url,
    price: {
      amount: node.originalUnitPriceSet?.shopMoney?.amount || "0",
      currency_code: node.originalUnitPriceSet?.shopMoney?.currencyCode || "USD",
    },
    fulfillable_quantity: node.fulfillableQuantity,
  };
}

function transformShopifyAddressToUCP(address: any): any {
  if (!address) return undefined;
  return {
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    province: address.province,
    province_code: address.provinceCode,
    country: address.country,
    country_code: address.countryCodeV2,
    zip: address.zip,
    phone: address.phone,
    first_name: address.firstName,
    last_name: address.lastName,
    company: address.company,
  };
}

function transformFulfillmentToEvents(fulfillments: any[]): UCPFulfillmentEvent[] {
  return fulfillments?.map((fulfillment) => ({
    id: fulfillment.id,
    line_item_ids: fulfillment.fulfillmentLineItems?.edges?.map(
      (e: any) => e.node.lineItem.id
    ) || [],
    status: mapFulfillmentStatus(fulfillment.status),
    tracking_number: fulfillment.trackingInfo?.[0]?.number,
    tracking_url: fulfillment.trackingInfo?.[0]?.url,
    carrier: fulfillment.trackingInfo?.[0]?.company,
    created_at: fulfillment.createdAt,
  })) || [];
}

function mapFulfillmentStatus(status: string): UCPFulfillmentEvent["status"] {
  switch (status) {
    case "SUCCESS":
      return "delivered";
    case "IN_PROGRESS":
      return "in_transit";
    case "FAILURE":
    case "CANCELLED":
      return "failed";
    default:
      return "pending";
  }
}

function transformRefundsToAdjustments(refunds: any[], currency: string): UCPAdjustment[] {
  return refunds?.map((refund) => ({
    id: refund.id,
    type: "refund" as const,
    amount: {
      amount: refund.totalRefundedSet?.shopMoney?.amount || "0",
      currency_code: currency,
    },
    reason: refund.note,
    created_at: refund.createdAt,
  })) || [];
}

function transformShopifyOrderToUCP(order: any, checkoutId?: string): UCPOrder {
  const currency = order.totalPriceSet?.shopMoney?.currencyCode || "USD";

  const totals: UCPTotal[] = [
    {
      type: "subtotal",
      amount: {
        amount: order.subtotalPriceSet?.shopMoney?.amount || "0",
        currency_code: currency,
      },
    },
    {
      type: "tax",
      amount: {
        amount: order.totalTaxSet?.shopMoney?.amount || "0",
        currency_code: currency,
      },
    },
    {
      type: "shipping",
      amount: {
        amount: order.totalShippingPriceSet?.shopMoney?.amount || "0",
        currency_code: currency,
      },
    },
    {
      type: "discount",
      amount: {
        amount: order.totalDiscountsSet?.shopMoney?.amount || "0",
        currency_code: currency,
      },
    },
    {
      type: "total",
      amount: {
        amount: order.totalPriceSet?.shopMoney?.amount || "0",
        currency_code: currency,
      },
    },
  ];

  const lineItems = order.lineItems?.edges?.map(transformShopifyLineItemToUCPOrder) || [];

  // Create expectations based on shipping address
  const expectations: UCPExpectation[] = order.shippingAddress ? [{
    id: `exp-${order.id}`,
    line_item_ids: lineItems.map((li: UCPOrderLineItem) => li.id),
    method: "shipping",
    destination: transformShopifyAddressToUCP(order.shippingAddress),
  }] : [];

  const ucpMetadata: UCPMetadata = {
    version: "2026-01-01",
    capabilities: {
      "dev.ucp.shopping.order": [{
        version: "2026-01-01",
        spec: "https://ucp.dev/specification/order",
      }],
    },
  };

  return {
    ucp: ucpMetadata,
    id: order.id,
    checkout_id: checkoutId || order.id, // May need draft order reference
    permalink_url: order.statusPageUrl,
    line_items: lineItems,
    fulfillment: {
      expectations,
      events: transformFulfillmentToEvents(order.fulfillments),
    },
    adjustments: transformRefundsToAdjustments(order.refunds, currency),
    totals,
  };
}

// ===== Order Service =====

export class OrderService {
  constructor(private admin: AdminApiContext) { }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<UCPOrder | null> {
    const response = await this.admin.graphql(`
      query Order($id: ID!) {
        order(id: $id) {
          ${ORDER_FIELDS}
        }
      }
    `, {
      variables: { id: orderId },
    });

    const data = await response.json();

    if (!data.data?.order) {
      return null;
    }

    return transformShopifyOrderToUCP(data.data.order);
  }

  /**
   * List orders
   */
  async listOrders(first: number = 20): Promise<UCPOrder[]> {
    const response = await this.admin.graphql(`
      query Orders($first: Int!) {
        orders(first: $first, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              ${ORDER_FIELDS}
            }
          }
        }
      }
    `, {
      variables: { first },
    });

    const data = await response.json();

    return data.data?.orders?.edges?.map((edge: any) =>
      transformShopifyOrderToUCP(edge.node)
    ) || [];
  }

  /**
   * Get order by checkout ID (searches by tag or metafield)
   */
  async getOrderByCheckoutId(checkoutId: string): Promise<UCPOrder | null> {
    // Search for orders that might be linked to this checkout
    const response = await this.admin.graphql(`
      query OrdersByTag($query: String!) {
        orders(first: 1, query: $query) {
          edges {
            node {
              ${ORDER_FIELDS}
            }
          }
        }
      }
    `, {
      variables: { query: `tag:checkout_${checkoutId}` },
    });

    const data = await response.json();
    const order = data.data?.orders?.edges?.[0]?.node;

    if (!order) {
      return null;
    }

    return transformShopifyOrderToUCP(order, checkoutId);
  }

  /**
   * Get total count of orders
   */
  async getOrderCount(): Promise<number> {
    const response = await this.admin.graphql(`
      query OrdersCount {
        ordersCount {
          count
        }
      }
    `);

    const data = await response.json();
    return data.data?.ordersCount?.count || 0;
  }
}
