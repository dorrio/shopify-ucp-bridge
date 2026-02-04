/**
 * MCP Server Service - Model Context Protocol for UCP Shopify Bridge
 * 
 * This service implements the MCP protocol for serverless environments
 * using JSON-RPC over HTTP (Streamable HTTP transport).
 * 
 * Endpoints:
 *   POST /api/mcp - Handle JSON-RPC requests (list tools, call tools)
 *   GET  /api/mcp - Server info and capabilities
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { CheckoutService, CartService, OrderService, ProductService } from "./ucp";
import { parseUCPLineItems } from "../utils/ucpTransformers";
import type {
    UCPCheckoutCreateRequest,
    UCPCheckoutUpdateRequest,
    UCPCheckoutCompleteRequest,
    UCPCartCreateRequest,
    UCPCartUpdateRequest,
} from "./ucp";

// ============================================================================
// MCP Types
// ============================================================================

interface MCPToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
    };
}

interface MCPRequest {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
}

interface MCPResponse {
    jsonrpc: "2.0";
    id: string | number | null;
    result?: unknown;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const MCP_TOOLS: MCPToolDefinition[] = [
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
        description: "Complete a checkout session. IMPORTANT: This will fail if the buyer email or shipping address have not been set using update_checkout first.",
        inputSchema: {
            type: "object",
            properties: {
                checkout_id: { type: "string", description: "Checkout session ID to complete" },
            },
            required: ["checkout_id"],
        },
    },
    {
        name: "cancel_checkout",
        description: "Cancel an incomplete checkout session.",
        inputSchema: {
            type: "object",
            properties: {
                checkout_id: { type: "string", description: "Checkout session ID to cancel" },
            },
            required: ["checkout_id"],
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
            },
        },
    },

    // Product Tools
    {
        name: "search_products",
        description: "Search for products by title or description.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search query (e.g. 'snowboard')" },
                limit: { type: "number", description: "Max results (default: 5)" },
            },
            required: ["query"],
        },
    },
];

// ============================================================================
// MCP Service Class
// ============================================================================

export class MCPService {
    private checkoutService: CheckoutService;
    private cartService: CartService;
    private orderService: OrderService;
    private productService: ProductService;

    constructor(admin: AdminApiContext) {
        this.checkoutService = new CheckoutService(admin);
        this.cartService = new CartService(admin);
        this.orderService = new OrderService(admin);
        this.productService = new ProductService(admin);
    }

    /**
     * Get server info and capabilities
     */
    getServerInfo() {
        return {
            name: "ucp-shopify-bridge",
            version: "1.0.0",
            protocolVersion: "2024-11-05",
            capabilities: {
                tools: {},
            },
        };
    }

    /**
     * Handle a JSON-RPC request
     */
    async handleRequest(request: MCPRequest): Promise<MCPResponse> {
        const { id, method, params } = request;

        try {
            let result: unknown;

            switch (method) {
                case "initialize":
                    result = {
                        protocolVersion: "2024-11-05",
                        serverInfo: this.getServerInfo(),
                        capabilities: {
                            tools: {},
                        },
                    };
                    break;

                case "tools/list":
                    result = { tools: MCP_TOOLS };
                    break;

                case "tools/call":
                    result = await this.handleToolCall(params as { name: string; arguments: Record<string, unknown> });
                    break;

                case "ping":
                    result = {};
                    break;

                default:
                    return {
                        jsonrpc: "2.0",
                        id,
                        error: {
                            code: -32601,
                            message: `Method not found: ${method}`,
                        },
                    };
            }

            return {
                jsonrpc: "2.0",
                id,
                result,
            };
        } catch (error) {
            console.error("MCP request error:", error);
            return {
                jsonrpc: "2.0",
                id,
                error: {
                    code: -32000,
                    message: error instanceof Error ? error.message : "Internal error",
                },
            };
        }
    }

    /**
     * Handle a tool call
     */
    private async handleToolCall(params: { name: string; arguments: Record<string, unknown> }) {
        const { name, arguments: args } = params;

        try {
            let result: unknown;

            switch (name) {
                // Checkout tools
                case "create_checkout": {
                    const transformedArgs = parseUCPLineItems(args);
                    // FIX: Ensure variant_id is populated if product_id is a variant GID
                    if (transformedArgs.line_items) {
                        transformedArgs.line_items = transformedArgs.line_items.map((item: any) => {
                            if (item.product_id && typeof item.product_id === 'string' && item.product_id.includes('ProductVariant') && !item.variant_id) {
                                return { ...item, variant_id: item.product_id };
                            }
                            return item;
                        });
                    }
                    result = await this.checkoutService.createCheckout(transformedArgs as unknown as UCPCheckoutCreateRequest);
                    break;
                }

                case "get_checkout": {
                    const checkoutId = (args as { checkout_id?: string }).checkout_id;
                    if (!checkoutId) throw new Error("checkout_id is required");
                    result = await this.checkoutService.getCheckout(checkoutId);
                    break;
                }

                case "update_checkout": {
                    const transformedArgs = parseUCPLineItems(args);
                    const { checkout_id, ...updateParams } = transformedArgs as { checkout_id?: string } & Record<string, unknown>;
                    if (!checkout_id) throw new Error("checkout_id is required");
                    result = await this.checkoutService.updateCheckout({
                        id: checkout_id,
                        ...updateParams
                    } as unknown as UCPCheckoutUpdateRequest & { id: string });
                    break;
                }

                case "complete_checkout": {
                    const completeCheckoutId = (args as { checkout_id?: string }).checkout_id;
                    if (!completeCheckoutId) throw new Error("checkout_id is required");
                    // The checkout service doesn't actually use the payment parameter
                    // as Shopify Draft Orders handle payment via invoice
                    result = await this.checkoutService.completeCheckout(
                        completeCheckoutId,
                        { payment: {} } as unknown as UCPCheckoutCompleteRequest
                    );
                    break;
                }

                case "cancel_checkout": {
                    const cancelCheckoutId = (args as { checkout_id?: string }).checkout_id;
                    if (!cancelCheckoutId) throw new Error("checkout_id is required");
                    result = await this.checkoutService.cancelCheckout(cancelCheckoutId);
                    break;
                }

                // Cart tools
                case "create_cart": {
                    const transformedArgs = parseUCPLineItems(args);
                    result = await this.cartService.createCart(transformedArgs as unknown as UCPCartCreateRequest);
                    break;
                }

                case "get_cart": {
                    const cartId = (args as { cart_id?: string }).cart_id;
                    if (!cartId) throw new Error("cart_id is required");
                    result = await this.cartService.getCart(cartId);
                    break;
                }

                case "update_cart": {
                    const transformedArgs = parseUCPLineItems(args);
                    const { cart_id, ...cartParams } = transformedArgs as { cart_id?: string } & Record<string, unknown>;
                    if (!cart_id) throw new Error("cart_id is required");
                    result = await this.cartService.updateCart({
                        id: cart_id,
                        ...cartParams
                    } as unknown as UCPCartUpdateRequest & { id: string });
                    break;
                }

                case "delete_cart": {
                    const deleteCartId = (args as { cart_id?: string }).cart_id;
                    if (!deleteCartId) throw new Error("cart_id is required");
                    result = await this.cartService.deleteCart(deleteCartId);
                    break;
                }

                // Order tools
                case "get_order": {
                    const orderId = (args as { order_id?: string }).order_id;
                    if (!orderId) throw new Error("order_id is required");
                    result = await this.orderService.getOrder(orderId);
                    break;
                }

                case "list_orders": {
                    const orderArgs = args as { limit?: number };
                    result = await this.orderService.listOrders(orderArgs.limit || 20);
                    break;
                }

                // Product tools
                case "search_products": {
                    const productArgs = args as { query?: string; limit?: number };
                    if (!productArgs.query) throw new Error("query is required");
                    result = await this.productService.searchProducts({
                        query: productArgs.query,
                        first: productArgs.limit
                    });
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
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: true,
                            message: error instanceof Error ? error.message : String(error),
                        }),
                    },
                ],
                isError: true,
            };
        }
    }
}
