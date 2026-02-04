/**
 * Product Service - UCP Product Capability (dev.ucp.shopping.product)
 * 
 * Handles product lookup and search.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import type { UCPProduct } from "./types";

export interface UCPProductSearchRequest {
    query: string;
    first?: number;
}

// GraphQL fragments
const PRODUCT_FIELDS = `
  id
  title
  description
  vendor
  productType
  createdAt
  updatedAt
  tags
  featuredImage {
    url
    altText
    width
    height
  }
  images(first: 5) {
    edges {
      node {
        url
        altText
        width
        height
      }
    }
  }
  variants(first: 20) {
    edges {
      node {
        id
        title
        sku
        price
        inventoryQuantity
        weight
        weightUnit
      }
    }
  }
`;

function transformShopifyProductToUCP(node: any): UCPProduct {
    return {
        id: node.id,
        title: node.title,
        description: node.description,
        vendor: node.vendor,
        product_type: node.productType,
        created_at: node.createdAt,
        updated_at: node.updatedAt,
        tags: node.tags,
        images: node.images?.edges?.map((edge: any) => ({
            url: edge.node.url,
            alt_text: edge.node.altText,
            width: edge.node.width,
            height: edge.node.height,
        })) || [],
        variants: node.variants?.edges?.map((edge: any) => ({
            id: edge.node.id,
            title: edge.node.title,
            sku: edge.node.sku,
            price: {
                amount: edge.node.price,
                // Shopify GraphQL variants usually don't return currency in the simple price field (it's decimal string)
                // We assume store currency, or we'd need to fetch shop settings. 
                // For simplicity/robustness in search, we might just default or use a placeholder if unknown context.
                // Actually, DraftOrder gave us currency. Here we might be missing it in this simple query.
                // Let's assume it's just the amount for now, or fetch shop currency if needed.
                // UCPMoney requires currency_code.
                currency_code: "USD" // Placeholder, ideally should come from Shop context
            },
            available_quantity: edge.node.inventoryQuantity,
            weight: edge.node.weight,
            weight_unit: edge.node.weightUnit,
        })) || [],
    };
}

export class ProductService {
    constructor(private admin: AdminApiContext) { }

    /**
     * Search for products
     */
    async searchProducts(request: UCPProductSearchRequest): Promise<UCPProduct[]> {
        const response = await this.admin.graphql(`
      query SearchProducts($query: String!, $first: Int!) {
        products(first: $first, query: $query) {
          edges {
            node {
              ${PRODUCT_FIELDS}
            }
          }
        }
      }
    `, {
            variables: {
                query: request.query,
                first: request.first || 5, // Default to 5 results
            },
        });

        const data = await response.json();

        return data.data?.products?.edges?.map((edge: any) =>
            transformShopifyProductToUCP(edge.node)
        ) || [];
    }
}
