import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { buildCORSHeaders, handleCORSPreflight } from "../utils/cors";

/**
 * UCP Profile Discovery Endpoint
 * https://ucp.dev/latest/specification/overview/#services
 * 
 * GET /ucp-profile - Returns business capabilities for UCP agents
 * OPTIONS /ucp-profile - CORS preflight
 * 
 * This allows AI agents to discover what UCP capabilities this business supports.
 * CORS is enabled to allow browser-based AI agents to access this endpoint.
 */

export async function loader({ request }: LoaderFunctionArgs) {
    // Handle CORS preflight
    const preflight = handleCORSPreflight(request);
    if (preflight) return preflight;

    console.log(`[UCP Profile] Request received: ${request.url}`);
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const corsHeaders = buildCORSHeaders(request);

    return json({
        version: "2026-01-01",
        name: "Shopify UCP Bridge",
        description: "Universal Commerce Protocol bridge for Shopify stores",

        // Services advertise transport bindings
        services: {
            "dev.ucp.shopping": [
                {
                    version: "2026-01-01",
                    transport: "rest",
                    schema: "https://ucp.dev/services/shopping/rest.openapi.json",
                    endpoint: baseUrl,
                },
                {
                    version: "2026-01-01",
                    transport: "mcp",
                    schema: "https://ucp.dev/services/shopping/mcp.json",
                    endpoint: "stdio",
                    tools: [
                        "create_checkout", "get_checkout", "update_checkout", "complete_checkout", "cancel_checkout",
                        "create_cart", "get_cart", "update_cart", "delete_cart",
                        "get_order", "list_orders",
                    ],
                },
                {
                    version: "2026-01-01",
                    transport: "a2a",
                    schema: "https://a2a-protocol.org/latest/specification/",
                    agentCard: `${baseUrl}/.well-known/agent-card.json`,
                    interfaces: {
                        jsonrpc: `${baseUrl}/a2a/jsonrpc`,
                        rest: `${baseUrl}/a2a/rest`,
                    },
                    skills: ["ucp-checkout", "ucp-cart", "ucp-order"],
                },
            ],
        },

        // Capabilities list specific features
        capabilities: {
            "dev.ucp.shopping.cart": [{
                version: "2026-01-01",
                spec: "https://ucp.dev/specification/cart",
                description: "Cart management for collecting line items",
            }],
            "dev.ucp.shopping.checkout": [{
                version: "2026-01-01",
                spec: "https://ucp.dev/specification/checkout",
                description: "Checkout session management with buyer info and payment",
                endpoints: {
                    create: "POST /checkout-sessions",
                    get: "GET /checkout-sessions/{id}",
                    update: "PUT /checkout-sessions/{id}",
                    complete: "POST /checkout-sessions/{id}/complete",
                    cancel: "POST /checkout-sessions/{id}/cancel",
                },
            }],
            "dev.ucp.shopping.order": [{
                version: "2026-01-01",
                spec: "https://ucp.dev/specification/order",
                description: "Order retrieval and fulfillment tracking",
            }],
        },

        // Supported features
        features: {
            currencies: ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"],
            payment_methods: ["invoice"], // Using Shopify's invoice flow
            fulfillment_types: ["shipping", "pickup"],
        },

        // Contact info
        links: [
            {
                rel: "documentation",
                href: "https://github.com/Universal-Commerce-Protocol/ucp",
                title: "UCP Documentation",
            },
        ],
    }, {
        headers: {
            "Cache-Control": "public, max-age=3600", // Cache for 1 hour
            ...corsHeaders,
        },
    });
}

