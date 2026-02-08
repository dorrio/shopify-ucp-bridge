
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { buildCORSHeaders, handleCORSPreflight } from "../utils/cors";
// Import the config directly - Remix/Vite handles the JSON import
import config from "../../ucp.config.json";
// We don't need the type at runtime for the import, but good to know it matches
import type { UCPConfig } from "../types/ucp-config";

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

    // Cast config to our type to ensure safety if we use it for logic
    const ucpConfig = config as unknown as UCPConfig;

    // Dynamically build services list based on enabled transports
    const services: Record<string, any[]> = {
        "dev.ucp.shopping": []
    };

    if (ucpConfig.transports.http?.enabled) {
        services["dev.ucp.shopping"].push({
            version: ucpConfig.ucp_version,
            transport: "rest",
            schema: "https://ucp.dev/services/shopping/rest.openapi.json",
            endpoint: baseUrl,
        });
    }

    if (ucpConfig.transports.mcp?.enabled) {
        services["dev.ucp.shopping"].push({
            version: ucpConfig.ucp_version,
            transport: "mcp",
            schema: "https://ucp.dev/services/shopping/mcp.json",
            endpoint: "stdio",
            tools: [
                "create_checkout", "get_checkout", "update_checkout", "complete_checkout", "cancel_checkout",
                "create_cart", "get_cart", "update_cart", "delete_cart",
                "get_order", "list_orders",
            ],
        });
    }

    if (ucpConfig.transports.a2a?.enabled) {
        services["dev.ucp.shopping"].push({
            version: ucpConfig.ucp_version,
            transport: "a2a",
            schema: "https://a2a-protocol.org/latest/specification/",
            agentCard: `${baseUrl}/.well-known/agent-card.json`,
            interfaces: {
                jsonrpc: `${baseUrl}/a2a/jsonrpc`,
                rest: `${baseUrl}/a2a/rest`,
            },
            skills: Object.keys(ucpConfig.capabilities)
                .filter(cap => ucpConfig.capabilities[cap].enabled)
                .map(cap => cap.replace("dev.ucp.shopping.", "ucp-")),
        });
    }

    // Dynamically build capabilities list
    const capabilities: Record<string, any[]> = {};

    // Mapping from config keys to spec URLs and descriptions
    const capabilityMeta: Record<string, { spec: string, description: string, endpoints?: any }> = {
        "dev.ucp.shopping.cart": {
            spec: "https://ucp.dev/specification/cart",
            description: "Cart management for collecting line items"
        },
        "dev.ucp.shopping.checkout": {
            spec: "https://ucp.dev/specification/checkout",
            description: "Checkout session management with buyer info and payment",
            endpoints: {
                create: "POST /checkout-sessions",
                get: "GET /checkout-sessions/{id}",
                update: "PUT /checkout-sessions/{id}",
                complete: "POST /checkout-sessions/{id}/complete",
                cancel: "POST /checkout-sessions/{id}/cancel",
            }
        },
        "dev.ucp.shopping.order": {
            spec: "https://ucp.dev/specification/order",
            description: "Order retrieval and fulfillment tracking"
        }
    };

    for (const [key, value] of Object.entries(ucpConfig.capabilities)) {
        if (value.enabled && capabilityMeta[key] && value.versions.length > 0) {
            capabilities[key] = [{
                version: value.versions[0],
                spec: capabilityMeta[key].spec,
                description: capabilityMeta[key].description,
                ...(capabilityMeta[key].endpoints ? { endpoints: capabilityMeta[key].endpoints } : {})
            }];
        }
    }

    return json({
        version: ucpConfig.ucp_version,
        name: ucpConfig.identity.name,
        description: ucpConfig.identity.description,
        services,
        capabilities,
        features: ucpConfig.features,
        links: [
            {
                rel: "documentation",
                href: "https://github.com/Universal-Commerce-Protocol/ucp",
                title: "UCP Documentation",
            },
        ],
    }, {
        headers: {
            "Cache-Control": "public, max-age=3600",
            ...corsHeaders,
        },
    });
}
