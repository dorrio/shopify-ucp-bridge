/**
 * Cart Service - UCP Cart Capability (dev.ucp.shopping.cart)
 * 
 * Maps UCP Cart operations to Shopify Draft Orders.
 * Cart is a lightweight pre-checkout container for line items.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import type {
  UCPCart,
  UCPCartCreateRequest,
  UCPCartUpdateRequest,
  UCPLineItem,
  UCPTotal,
  UCPMetadata,
} from "./types";

// GraphQL fragments
const DRAFT_ORDER_FIELDS = `
  id
  name
  createdAt
  updatedAt
  invoiceUrl
  status
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
`;

// ===== Transformers: Shopify ↔ UCP =====

function transformLineItemToShopify(item: UCPLineItem): object {
  return {
    variantId: item.variant_id,
    quantity: item.quantity,
    ...(item.properties && { customAttributes: Object.entries(item.properties).map(([key, value]) => ({ key, value })) }),
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

function transformShopifyDraftOrderToUCPCart(draftOrder: any): UCPCart {
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
      type: "total",
      amount: {
        amount: draftOrder.totalPriceSet?.shopMoney?.amount || "0",
        currency_code: currency,
      },
    },
  ];

  const ucpMetadata: UCPMetadata = {
    version: "2026-01-01",
    capabilities: {
      "dev.ucp.shopping.cart": [{
        version: "2026-01-01",
        spec: "https://ucp.dev/specification/cart",
      }],
    },
  };

  return {
    ucp: ucpMetadata,
    id: draftOrder.id,
    line_items: draftOrder.lineItems?.edges?.map(transformShopifyLineItemToUCP) || [],
    currency,
    totals,
    continue_url: draftOrder.invoiceUrl,
    buyer: draftOrder.customer ? {
      email: draftOrder.customer.email,
      first_name: draftOrder.customer.firstName,
      last_name: draftOrder.customer.lastName,
      phone: draftOrder.customer.phone,
    } : undefined,
  };
}

// ===== Cart Service =====

export class CartService {
  constructor(private admin: AdminApiContext) { }

  /**
   * Create a new cart (Draft Order)
   */
  async createCart(request: UCPCartCreateRequest): Promise<UCPCart> {
    const lineItems = request.line_items.map(transformLineItemToShopify);

    const response = await this.admin.graphql(`
      mutation DraftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            ${DRAFT_ORDER_FIELDS}
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        input: {
          lineItems,
          ...(request.buyer?.email && { email: request.buyer.email }),
        },
      },
    });

    const data = await response.json();

    if (data.data?.draftOrderCreate?.userErrors?.length > 0) {
      throw new Error(data.data.draftOrderCreate.userErrors[0].message);
    }

    return transformShopifyDraftOrderToUCPCart(data.data.draftOrderCreate.draftOrder);
  }

  /**
   * Get a cart by ID
   */
  async getCart(cartId: string): Promise<UCPCart | null> {
    const response = await this.admin.graphql(`
      query DraftOrder($id: ID!) {
        draftOrder(id: $id) {
          ${DRAFT_ORDER_FIELDS}
        }
      }
    `, {
      variables: { id: cartId },
    });

    const data = await response.json();

    if (!data.data?.draftOrder) {
      return null;
    }

    return transformShopifyDraftOrderToUCPCart(data.data.draftOrder);
  }

  /**
   * Update a cart
   */
  async updateCart(request: UCPCartUpdateRequest): Promise<UCPCart> {
    const lineItems = request.line_items.map(transformLineItemToShopify);

    const response = await this.admin.graphql(`
      mutation DraftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
        draftOrderUpdate(id: $id, input: $input) {
          draftOrder {
            ${DRAFT_ORDER_FIELDS}
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
        input: {
          lineItems,
          ...(request.buyer?.email && { email: request.buyer.email }),
        },
      },
    });

    const data = await response.json();

    if (data.data?.draftOrderUpdate?.userErrors?.length > 0) {
      throw new Error(data.data.draftOrderUpdate.userErrors[0].message);
    }

    return transformShopifyDraftOrderToUCPCart(data.data.draftOrderUpdate.draftOrder);
  }

  /**
   * Delete a cart
   */
  async deleteCart(cartId: string): Promise<boolean> {
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
        input: { id: cartId },
      },
    });

    const data = await response.json();

    return !!data.data?.draftOrderDelete?.deletedId;
  }

  /**
   * List all carts (Draft Orders)
   */
  async listCarts(first: number = 20): Promise<UCPCart[]> {
    const response = await this.admin.graphql(`
      query DraftOrders($first: Int!) {
        draftOrders(first: $first, sortKey: UPDATED_AT, reverse: true) {
          edges {
            node {
              ${DRAFT_ORDER_FIELDS}
            }
          }
        }
      }
    `, {
      variables: { first },
    });

    const data = await response.json();

    return data.data?.draftOrders?.edges?.map((edge: any) =>
      transformShopifyDraftOrderToUCPCart(edge.node)
    ) || [];
  }

  /**
   * Get total count of carts (Draft Orders)
   */
  async getCartCount(): Promise<number> {
    const response = await this.admin.graphql(`
      query DraftOrdersCount {
        draftOrdersCount {
          count
        }
      }
    `);

    const data = await response.json();
    return data.data?.draftOrdersCount?.count || 0;
  }
}
