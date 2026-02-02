import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { buildCORSHeaders, handleCORSPreflight } from "../utils/cors";

/**
 * A2A Agent Card Discovery Endpoint
 * https://a2a-protocol.org/latest/specification/#8-agent-discovery-the-agent-card
 *
 * GET /.well-known/agent-card.json - Returns the A2A Agent Card
 * OPTIONS /.well-known/agent-card.json - CORS preflight
 *
 * This allows AI agents to discover the A2A capabilities of this business.
 * Standard well-known path per A2A specification.
 */

export async function loader({ request }: LoaderFunctionArgs) {
    // Handle CORS preflight
    const preflight = handleCORSPreflight(request);
    if (preflight) return preflight;

    console.log(`[A2A Agent Card] Request received: ${request.url}`);
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const corsHeaders = buildCORSHeaders(request);

    // Agent Card following A2A Protocol RC v1.0
    const agentCard = {
        protocolVersion: "1.0",
        name: "UCP Shopify Bridge Agent",
        description:
            "Universal Commerce Protocol bridge for Shopify stores. Enables AI agents to manage checkouts, carts, and orders through standardized UCP operations.",
        version: "1.0.0",
        url: `${baseUrl}/a2a/jsonrpc`,
        capabilities: {
            streaming: false,
            pushNotifications: false,
            stateTransitionHistory: false,
        },
        defaultInputModes: ["application/json", "text/plain"],
        defaultOutputModes: ["application/json"],
        additionalInterfaces: [
            { url: `${baseUrl}/a2a/jsonrpc`, transport: "JSONRPC" },
            { url: `${baseUrl}/a2a/rest`, transport: "HTTP+JSON" },
        ],
        skills: [
            {
                id: "ucp-checkout",
                name: "Checkout Management",
                description:
                    "Create, retrieve, update, complete, and cancel checkout sessions. Supports buyer info, shipping addresses, and line items.",
                tags: ["commerce", "checkout", "ucp", "shopping"],
                examples: [
                    'Create a checkout with 2 units of product "gid://shopify/Product/12345"',
                    "Get checkout status for session abc-123",
                    "Complete the checkout and convert to order",
                    "Cancel the incomplete checkout session",
                ],
                inputModes: ["application/json", "text/plain"],
                outputModes: ["application/json"],
            },
            {
                id: "ucp-cart",
                name: "Cart Operations",
                description:
                    "Create and manage shopping carts. Add, update, or remove line items before converting to checkout.",
                tags: ["commerce", "cart", "ucp", "shopping"],
                examples: [
                    "Create a new cart with 3 items",
                    "Add product xyz to my cart",
                    "Update quantity of item in cart",
                    "Delete the cart",
                ],
                inputModes: ["application/json", "text/plain"],
                outputModes: ["application/json"],
            },
            {
                id: "ucp-order",
                name: "Order Retrieval",
                description:
                    "Retrieve order details and list orders. Track fulfillment status and shipping information.",
                tags: ["commerce", "order", "ucp", "fulfillment"],
                examples: [
                    "Get order details for order #1234",
                    "List my recent orders",
                    "What is the fulfillment status of order xyz?",
                ],
                inputModes: ["application/json", "text/plain"],
                outputModes: ["application/json"],
            },
        ],
    };

    return json(agentCard, {
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600", // Cache for 1 hour
            ...corsHeaders,
        },
    });
}
