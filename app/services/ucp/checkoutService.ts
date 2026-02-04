/**
 * Checkout Service - UCP Checkout Capability (dev.ucp.shopping.checkout)
 * 
 * Maps UCP Checkout operations to Shopify Draft Orders with invoice flow.
 * Handles the full checkout lifecycle: create → update → complete.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import type {
  UCPCheckout,
  UCPCheckoutCreateRequest,
  UCPCheckoutUpdateRequest,
  UCPCheckoutCompleteRequest,
  UCPCheckoutStatus,
  UCPLineItem,
  UCPTotal,
  UCPMetadata,
  UCPLink,
  UCPMessage,
} from "./types";

// GraphQL fragments
const DRAFT_ORDER_CHECKOUT_FIELDS = `
  id
  name
  createdAt
  updatedAt
  invoiceUrl
  status
  completedAt
  order {
    id
    name
    statusPageUrl
  }
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
  lineItems(first: 50) {
    edges {
      node {
        id
        name
        quantity
        sku
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
  billingAddress {
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
`;

// ===== Status Mapping =====

function mapShopifyStatusToUCP(draftOrder: any): UCPCheckoutStatus {
  if (draftOrder.order) {
    return "completed";
  }
  if (draftOrder.status === "COMPLETED") {
    return "completed";
  }

  // Strict validation: Only ready if we have email and shipping
  // This matches the validation in completeCheckout
  if (draftOrder.invoiceUrl && draftOrder.customer?.email && draftOrder.shippingAddress) {
    return "ready_for_complete";
  }
  return "incomplete";
}

/**
 * Generate UCP messages based on checkout state
 * Returns structured error/warning messages for the LLM to understand what's missing
 */
function generateCheckoutMessages(draftOrder: any, status: UCPCheckoutStatus): UCPMessage[] {
  const messages: UCPMessage[] = [];

  if (status === "incomplete") {
    if (!draftOrder.customer?.email) {
      messages.push({
        type: "error",
        code: "missing_buyer_email",
        content: "Buyer email is required to proceed with checkout",
        severity: "requires_buyer_input",
        field: "buyer.email",
      });
    }

    if (!draftOrder.shippingAddress) {
      messages.push({
        type: "error",
        code: "missing_shipping_address",
        content: "Shipping address is required for fulfillment",
        severity: "requires_buyer_input",
        field: "fulfillment.destination",
      });
    }

    if (!draftOrder.lineItems?.edges?.length) {
      messages.push({
        type: "error",
        code: "empty_cart",
        content: "At least one line item is required",
        severity: "recoverable",
        field: "line_items",
      });
    }
  }

  if (status === "requires_escalation") {
    messages.push({
      type: "warning",
      code: "requires_buyer_input",
      content: "This checkout requires buyer input. Redirect to continue_url to complete.",
      severity: "requires_buyer_review",
    });
  }

  return messages;
}

// ===== Transformers =====

function transformLineItemToShopify(item: UCPLineItem): object {
  return {
    variantId: item.variant_id,
    quantity: item.quantity,
    ...(item.properties && {
      customAttributes: Object.entries(item.properties).map(([key, value]) => ({ key, value }))
    }),
  };
}

function transformShopifyLineItemToUCP(edge: any): UCPLineItem {
  const node = edge.node;
  const variant = node.variant;
  return {
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
  };
}

function transformAddressToShopify(address: any): object {
  return {
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    province: address.province,
    country: address.country,
    zip: address.zip,
    phone: address.phone,
    firstName: address.first_name,
    lastName: address.last_name,
    company: address.company,
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

function transformShopifyDraftOrderToUCPCheckout(draftOrder: any): UCPCheckout {
  const currency = draftOrder.totalPriceSet?.shopMoney?.currencyCode || "USD";

  const totals: UCPTotal[] = [
    {
      type: "subtotal",
      amount: {
        amount: draftOrder.subtotalPriceSet?.shopMoney?.amount || "0",
        currency_code: currency,
      },
    },
    {
      type: "tax",
      amount: {
        amount: draftOrder.totalTaxSet?.shopMoney?.amount || "0",
        currency_code: currency,
      },
    },
    {
      type: "shipping",
      amount: {
        amount: draftOrder.totalShippingPriceSet?.shopMoney?.amount || "0",
        currency_code: currency,
      },
    },
    {
      type: "discount",
      amount: {
        amount: draftOrder.totalDiscountsSet?.shopMoney?.amount || "0",
        currency_code: currency,
      },
    },
    {
      type: "total",
      amount: {
        amount: draftOrder.totalPriceSet?.shopMoney?.amount || "0",
        currency_code: currency,
      },
    },
  ];

  const links: UCPLink[] = [
    { rel: "self", href: `/checkout-sessions/${draftOrder.id}` },
  ];

  if (draftOrder.invoiceUrl) {
    links.push({ rel: "checkout", href: draftOrder.invoiceUrl, title: "Complete checkout" });
  }

  const ucpMetadata: UCPMetadata = {
    version: "2026-01-01",
    capabilities: {
      "dev.ucp.shopping.checkout": [{
        version: "2026-01-01",
        spec: "https://ucp.dev/specification/checkout",
      }],
    },
  };

  const status = mapShopifyStatusToUCP(draftOrder);
  const messages = generateCheckoutMessages(draftOrder, status);

  // Calculate expires_at: 24 hours from creation for non-completed checkouts
  const CHECKOUT_TTL_HOURS = 24;
  let expiresAt: string | undefined;
  if (status !== 'completed' && status !== 'canceled' && draftOrder.createdAt) {
    const createdDate = new Date(draftOrder.createdAt);
    createdDate.setHours(createdDate.getHours() + CHECKOUT_TTL_HOURS);
    expiresAt = createdDate.toISOString();
  }

  return {
    ucp: ucpMetadata,
    id: draftOrder.id,
    line_items: draftOrder.lineItems?.edges?.map(transformShopifyLineItemToUCP) || [],
    status,
    currency,
    totals,
    links,
    messages: messages.length > 0 ? messages : undefined,
    expires_at: expiresAt,
    continue_url: status === "requires_escalation" ? draftOrder.invoiceUrl : undefined,
    buyer: draftOrder.customer ? {
      email: draftOrder.customer.email,
      first_name: draftOrder.customer.firstName,
      last_name: draftOrder.customer.lastName,
      phone: draftOrder.customer.phone,
      addresses: [
        transformShopifyAddressToUCP(draftOrder.shippingAddress),
        transformShopifyAddressToUCP(draftOrder.billingAddress),
      ].filter(Boolean),
    } : undefined,
    order: draftOrder.order ? {
      id: draftOrder.order.id,
      number: draftOrder.order.name,
      permalink_url: draftOrder.order.statusPageUrl,
    } : undefined,
  };
}

// ===== Checkout Service =====

export class CheckoutService {
  constructor(private admin: AdminApiContext) { }

  /**
   * Create a new checkout session
   */
  async createCheckout(request: UCPCheckoutCreateRequest): Promise<UCPCheckout> {
    const lineItems = request.line_items.map(transformLineItemToShopify);

    const input: any = {
      lineItems,
    };

    if (request.buyer?.email) {
      input.email = request.buyer.email;
    }

    if (request.fulfillment?.destination) {
      input.shippingAddress = transformAddressToShopify(request.fulfillment.destination);
    }

    if (request.payment?.billing_address) {
      input.billingAddress = transformAddressToShopify(request.payment.billing_address);
    }

    const response = await this.admin.graphql(`
      mutation DraftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            ${DRAFT_ORDER_CHECKOUT_FIELDS}
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: { input },
    });

    const data = await response.json();

    if (data.data?.draftOrderCreate?.userErrors?.length > 0) {
      throw new Error(data.data.draftOrderCreate.userErrors[0].message);
    }

    return transformShopifyDraftOrderToUCPCheckout(data.data.draftOrderCreate.draftOrder);
  }

  /**
   * Get checkout by ID
   */
  async getCheckout(checkoutId: string): Promise<UCPCheckout | null> {
    const response = await this.admin.graphql(`
      query DraftOrder($id: ID!) {
        draftOrder(id: $id) {
          ${DRAFT_ORDER_CHECKOUT_FIELDS}
        }
      }
    `, {
      variables: { id: checkoutId },
    });

    const data = await response.json();

    if (!data.data?.draftOrder) {
      return null;
    }

    return transformShopifyDraftOrderToUCPCheckout(data.data.draftOrder);
  }

  /**
   * Update checkout
   */
  async updateCheckout(request: UCPCheckoutUpdateRequest): Promise<UCPCheckout> {
    const input: any = {};

    if (request.line_items) {
      input.lineItems = request.line_items.map(transformLineItemToShopify);
    }

    if (request.buyer?.email) {
      input.email = request.buyer.email;
    }

    if (request.fulfillment?.destination) {
      input.shippingAddress = transformAddressToShopify(request.fulfillment.destination);
    }

    if (request.payment?.billing_address) {
      input.billingAddress = transformAddressToShopify(request.payment.billing_address);
    }

    const response = await this.admin.graphql(`
      mutation DraftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
        draftOrderUpdate(id: $id, input: $input) {
          draftOrder {
            ${DRAFT_ORDER_CHECKOUT_FIELDS}
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        id: request.id,
        input,
      },
    });

    const data = await response.json();

    if (data.data?.draftOrderUpdate?.userErrors?.length > 0) {
      throw new Error(data.data.draftOrderUpdate.userErrors[0].message);
    }

    return transformShopifyDraftOrderToUCPCheckout(data.data.draftOrderUpdate.draftOrder);
  }

  /**
   * Complete checkout - converts Draft Order to Order
   */
  async completeCheckout(checkoutId: string, _request: UCPCheckoutCompleteRequest): Promise<UCPCheckout> {
    // 1. Fetch current state to validate
    const checkout = await this.getCheckout(checkoutId);
    if (!checkout) {
      throw new Error(`Checkout ${checkoutId} not found`);
    }

    // 2. Strict validation: Ensure email and shipping address are present
    const email = checkout.buyer?.email;
    const hasShipping = checkout.buyer?.addresses?.some(addr => addr.address1 && addr.city);

    if (!email || !hasShipping) {
      const missing = [];
      if (!email) missing.push("buyer email");
      if (!hasShipping) missing.push("shipping address");

      throw new Error(`Cannot complete checkout: ${missing.join(" and ")} is missing. Please use update_checkout to provide these details first.`);
    }

    // 3. Complete the order
    const response = await this.admin.graphql(`
      mutation DraftOrderComplete($id: ID!) {
        draftOrderComplete(id: $id) {
          draftOrder {
            ${DRAFT_ORDER_CHECKOUT_FIELDS}
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: { id: checkoutId },
    });

    const data = await response.json();

    if (data.data?.draftOrderComplete?.userErrors?.length > 0) {
      throw new Error(data.data.draftOrderComplete.userErrors[0].message);
    }

    return transformShopifyDraftOrderToUCPCheckout(data.data.draftOrderComplete.draftOrder);
  }

  /**
   * Send invoice for checkout
   */
  async sendInvoice(checkoutId: string, email?: string): Promise<UCPCheckout> {
    const response = await this.admin.graphql(`
      mutation DraftOrderInvoiceSend($id: ID!, $email: EmailInput) {
        draftOrderInvoiceSend(id: $id, email: $email) {
          draftOrder {
            ${DRAFT_ORDER_CHECKOUT_FIELDS}
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        id: checkoutId,
        ...(email && { email: { to: email } }),
      },
    });

    const data = await response.json();

    if (data.data?.draftOrderInvoiceSend?.userErrors?.length > 0) {
      throw new Error(data.data.draftOrderInvoiceSend.userErrors[0].message);
    }

    return transformShopifyDraftOrderToUCPCheckout(data.data.draftOrderInvoiceSend.draftOrder);
  }

  /**
   * Cancel checkout - deletes the Draft Order and returns the last known state
   */
  async cancelCheckout(checkoutId: string): Promise<UCPCheckout> {
    // 1. Retrieve current state before deletion
    const checkout = await this.getCheckout(checkoutId);

    if (!checkout) {
      throw new Error(`Checkout ${checkoutId} not found`);
    }

    // 2. Delete the draft order
    const response = await this.admin.graphql(`
      mutation DraftOrderDelete($input: DraftOrderDeleteInput!) {
        draftOrderDelete(input: $input) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        input: { id: checkoutId },
      },
    });

    const data = await response.json();

    if (data.data?.draftOrderDelete?.userErrors?.length > 0) {
      throw new Error(data.data.draftOrderDelete.userErrors[0].message);
    }

    // 3. Return the checkout object with status updated to 'canceled'
    return {
      ...checkout,
      status: 'canceled',
      messages: [{
        type: "info",
        code: "checkout_canceled",
        content: "Checkout session has been canceled",
      }],
    };
  }
}
