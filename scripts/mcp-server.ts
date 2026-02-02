#!/usr/bin/env npx tsx

/**
 * MCP Server for UCP Shopify Bridge
 * 
 * This server exposes UCP shopping capabilities as MCP tools,
 * enabling LLMs to directly call checkout, cart, and order operations.
 * 
 * Usage:
 *   pnpm run mcp
 * 
 * Configuration (environment variables):
 *   SHOPIFY_STORE_URL - Your myshopify.com store URL
 *   SHOPIFY_ACCESS_TOKEN - Admin API access token
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    type Tool,
} from "@modelcontextprotocol/sdk/types.js";

// ============================================================================
// Tool Definitions
// ============================================================================

const UCP_TOOLS: Tool[] = [
    // Checkout Tools
    {
        name: "create_checkout",
        description: "Create a new UCP checkout session with line items. Returns checkout ID, totals, and status.",
        inputSchema: {
            type: "object",
            properties: {
                line_items: {
                    type: "array",
                    description: "Array of items to add to checkout",
                    items: {
                        type: "object",
                        properties: {
                            product_id: { type: "string", description: "Product ID or variant ID" },
                            quantity: { type: "number", description: "Quantity to purchase" },
                            price: {
                                type: "object",
                                properties: {
                                    amount: { type: "integer", description: "Price in minor units (cents)" },
                                    currency_code: { type: "string", description: "ISO 4217 currency code" },
                                },
                                required: ["amount", "currency_code"],
                            },
                        },
                        required: ["product_id", "quantity"],
                    },
                },
                buyer: {
                    type: "object",
                    description: "Buyer information",
                    properties: {
                        email: { type: "string" },
                        first_name: { type: "string" },
                        last_name: { type: "string" },
                        phone: { type: "string" },
                    },
                },
                shipping_address: {
                    type: "object",
                    description: "Shipping address",
                    properties: {
                        address1: { type: "string" },
                        address2: { type: "string" },
                        city: { type: "string" },
                        province: { type: "string" },
                        country: { type: "string" },
                        zip: { type: "string" },
                    },
                },
            },
            required: ["line_items"],
        },
    },
    {
        name: "get_checkout",
        description: "Retrieve a checkout session by ID. Returns current status, line items, totals, and messages.",
        inputSchema: {
            type: "object",
            properties: {
                checkout_id: {
                    type: "string",
                    description: "The checkout session ID (Shopify Draft Order GID)",
                },
            },
            required: ["checkout_id"],
        },
    },
    {
        name: "update_checkout",
        description: "Update an existing checkout session with buyer info, addresses, or line items.",
        inputSchema: {
            type: "object",
            properties: {
                checkout_id: { type: "string", description: "Checkout session ID" },
                buyer: {
                    type: "object",
                    properties: {
                        email: { type: "string" },
                        first_name: { type: "string" },
                        last_name: { type: "string" },
                    },
                },
                shipping_address: {
                    type: "object",
                    properties: {
                        address1: { type: "string" },
                        city: { type: "string" },
                        province: { type: "string" },
                        country: { type: "string" },
                        zip: { type: "string" },
                    },
                },
                line_items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            product_id: { type: "string" },
                            quantity: { type: "number" },
                        },
                    },
                },
            },
            required: ["checkout_id"],
        },
    },
    {
        name: "complete_checkout",
        description: "Complete a checkout session, converting it to an order. Requires all buyer information to be set.",
        inputSchema: {
            type: "object",
            properties: {
                checkout_id: { type: "string", description: "Checkout session ID to complete" },
                meta: {
                    type: "object",
                    properties: {
                        "idempotency-key": {
                            type: "string",
                            description: "UUID v4 for retry safety. Required.",
                        },
                        "ucp-agent": {
                            type: "object",
                            description: "Agent identity information",
                        }
                    },
                    required: ["idempotency-key"],
                },
            },
            required: ["checkout_id", "meta"],
        },
    },
    {
        name: "cancel_checkout",
        description: "Cancel an incomplete checkout session.",
        inputSchema: {
            type: "object",
            properties: {
                checkout_id: { type: "string", description: "Checkout session ID to cancel" },
                meta: {
                    type: "object",
                    properties: {
                        "idempotency-key": {
                            type: "string",
                            description: "UUID v4 for retry safety. Required.",
                        },
                    },
                    required: ["idempotency-key"],
                },
            },
            required: ["checkout_id", "meta"],
        },
    },

    // Cart Tools
    {
        name: "create_cart",
        description: "Create a new shopping cart with line items.",
        inputSchema: {
            type: "object",
            properties: {
                line_items: {
                    type: "array",
                    description: "Items to add to cart",
                    items: {
                        type: "object",
                        properties: {
                            product_id: { type: "string" },
                            quantity: { type: "number" },
                            price: {
                                type: "object",
                                properties: {
                                    amount: { type: "integer" },
                                    currency_code: { type: "string" },
                                },
                            },
                        },
                        required: ["product_id", "quantity"],
                    },
                },
            },
            required: ["line_items"],
        },
    },
    {
        name: "get_cart",
        description: "Retrieve a cart by ID.",
        inputSchema: {
            type: "object",
            properties: {
                cart_id: { type: "string", description: "Cart ID" },
            },
            required: ["cart_id"],
        },
    },
    {
        name: "update_cart",
        description: "Update cart line items.",
        inputSchema: {
            type: "object",
            properties: {
                cart_id: { type: "string" },
                line_items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            product_id: { type: "string" },
                            quantity: { type: "number" },
                        },
                    },
                },
            },
            required: ["cart_id", "line_items"],
        },
    },
    {
        name: "delete_cart",
        description: "Delete a cart.",
        inputSchema: {
            type: "object",
            properties: {
                cart_id: { type: "string" },
            },
            required: ["cart_id"],
        },
    },

    // Order Tools
    {
        name: "get_order",
        description: "Retrieve an order by ID. Returns order details, line items, fulfillment status.",
        inputSchema: {
            type: "object",
            properties: {
                order_id: { type: "string", description: "Order ID (Shopify Order GID)" },
            },
            required: ["order_id"],
        },
    },
    {
        name: "list_orders",
        description: "List recent orders with optional filters.",
        inputSchema: {
            type: "object",
            properties: {
                limit: { type: "number", description: "Max orders to return (default: 20)" },
                status: {
                    type: "string",
                    enum: ["open", "closed", "cancelled", "any"],
                    description: "Filter by order status",
                },
            },
        },
    },
];

// ============================================================================
// REST API Client
// ============================================================================

class UCPRestClient {
    private baseUrl: string;
    private accessToken: string;

    constructor() {
        this.baseUrl = process.env.SHOPIFY_STORE_URL || "http://localhost:3000";
        this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
    }

    private async request(method: string, path: string, body?: unknown): Promise<unknown> {
        const url = `${this.baseUrl}${path}`;
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "UCP-Agent": "mcp-server/1.0 (ucp-shopify-bridge)",
        };

        if (this.accessToken) {
            headers["Authorization"] = `Bearer ${this.accessToken}`;
        }

        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`HTTP ${response.status}: ${error}`);
        }

        return response.json();
    }

    // Checkout operations
    async createCheckout(params: unknown): Promise<unknown> {
        return this.request("POST", "/checkout-sessions", params);
    }

    async getCheckout(id: string): Promise<unknown> {
        return this.request("GET", `/checkout-sessions/${encodeURIComponent(id)}`);
    }

    async updateCheckout(id: string, params: unknown): Promise<unknown> {
        return this.request("PUT", `/checkout-sessions/${encodeURIComponent(id)}`, params);
    }

    async completeCheckout(id: string, meta?: Record<string, any>): Promise<unknown> {
        return this.request("POST", `/checkout-sessions/${encodeURIComponent(id)}/complete`, { meta });
    }

    async cancelCheckout(id: string, meta?: Record<string, any>): Promise<unknown> {
        return this.request("POST", `/checkout-sessions/${encodeURIComponent(id)}/cancel`, { meta });
    }

    // Cart operations
    async createCart(params: unknown): Promise<unknown> {
        return this.request("POST", "/carts", params);
    }

    async getCart(id: string): Promise<unknown> {
        return this.request("GET", `/carts/${encodeURIComponent(id)}`);
    }

    async updateCart(id: string, params: unknown): Promise<unknown> {
        return this.request("PUT", `/carts/${encodeURIComponent(id)}`, params);
    }

    async deleteCart(id: string): Promise<unknown> {
        return this.request("DELETE", `/carts/${encodeURIComponent(id)}`);
    }

    // Order operations
    async getOrder(id: string): Promise<unknown> {
        return this.request("GET", `/orders/${encodeURIComponent(id)}`);
    }

    async listOrders(limit?: number, status?: string): Promise<unknown> {
        const params = new URLSearchParams();
        if (limit) params.set("limit", limit.toString());
        if (status) params.set("status", status);
        const query = params.toString() ? `?${params.toString()}` : "";
        return this.request("GET", `/orders${query}`);
    }
}

// ============================================================================
// MCP Server
// ============================================================================

const server = new Server(
    {
        name: "ucp-shopify-bridge",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

const client = new UCPRestClient();

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: UCP_TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        let result: unknown;

        switch (name) {
            // Checkout tools
            case "create_checkout":
                result = await client.createCheckout(args);
                break;
            case "get_checkout":
                result = await client.getCheckout((args as { checkout_id: string }).checkout_id);
                break;
            case "update_checkout": {
                const { checkout_id, ...updateParams } = args as { checkout_id: string };
                result = await client.updateCheckout(checkout_id, updateParams);
                break;
            }
            case "complete_checkout": {
                const { checkout_id, meta } = args as { checkout_id: string; meta: any };
                if (!meta?.["idempotency-key"]) {
                    throw new Error("Missing required argument: meta.idempotency-key");
                }
                result = await client.completeCheckout(checkout_id, meta);
                break;
            }
            case "cancel_checkout": {
                const { checkout_id, meta } = args as { checkout_id: string; meta: any };
                if (!meta?.["idempotency-key"]) {
                    throw new Error("Missing required argument: meta.idempotency-key");
                }
                result = await client.cancelCheckout(checkout_id, meta);
                break;
            }

            // Cart tools
            case "create_cart":
                result = await client.createCart(args);
                break;
            case "get_cart":
                result = await client.getCart((args as { cart_id: string }).cart_id);
                break;
            case "update_cart": {
                const { cart_id, ...cartParams } = args as { cart_id: string };
                result = await client.updateCart(cart_id, cartParams);
                break;
            }
            case "delete_cart":
                result = await client.deleteCart((args as { cart_id: string }).cart_id);
                break;

            // Order tools
            case "get_order":
                result = await client.getOrder((args as { order_id: string }).order_id);
                break;
            case "list_orders": {
                const orderArgs = args as { limit?: number; status?: string };
                result = await client.listOrders(orderArgs.limit, orderArgs.status);
                break;
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        error: true,
                        message: errorMessage,
                    }),
                },
            ],
            isError: true,
        };
    }
});

// ============================================================================
// Startup
// ============================================================================

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("UCP MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
