#!/usr/bin/env npx tsx

/**
 * A2A (Agent-to-Agent) Server for UCP Shopify Bridge
 *
 * This server exposes UCP shopping capabilities as an A2A-compliant agent,
 * enabling agent-to-agent communication for checkout, cart, and order operations.
 *
 * Usage:
 *   pnpm run a2a
 *
 * Configuration (environment variables):
 *   SHOPIFY_STORE_URL - Your myshopify.com store URL (default: http://localhost:3000)
 *   SHOPIFY_ACCESS_TOKEN - Admin API access token
 *   A2A_PORT - Port for A2A server (default: 5000)
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import express from "express";
import { v4 as uuidv4 } from "uuid";
import type { AgentCard, Message, Part } from "@a2a-js/sdk";
import { AGENT_CARD_PATH } from "@a2a-js/sdk";
import {
    AgentExecutor,
    RequestContext,
    ExecutionEventBus,
    DefaultRequestHandler,
    InMemoryTaskStore,
} from "@a2a-js/sdk/server";
import {
    agentCardHandler,
    jsonRpcHandler,
    restHandler,
    UserBuilder,
} from "@a2a-js/sdk/server/express";

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.A2A_PORT || "5000", 10);
const STORE_URL = process.env.SHOPIFY_STORE_URL || "http://localhost:3000";
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || "";

// ============================================================================
// Agent Card Definition
// ============================================================================

const ucpAgentCard: AgentCard = {
    protocolVersion: "1.0",
    name: "UCP Shopify Bridge Agent",
    description:
        "Universal Commerce Protocol bridge for Shopify stores. Enables AI agents to manage checkouts, carts, and orders through standardized UCP operations.",
    version: "1.0.0",
    url: `http://localhost:${PORT}/a2a/jsonrpc`,
    capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
    },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json"],
    additionalInterfaces: [
        { url: `http://localhost:${PORT}/a2a/jsonrpc`, transport: "JSONRPC" },
        { url: `http://localhost:${PORT}/a2a/rest`, transport: "HTTP+JSON" },
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

// ============================================================================
// UCP REST Client
// ============================================================================

class UCPRestClient {
    private baseUrl: string;
    private accessToken: string;

    constructor() {
        this.baseUrl = STORE_URL;
        this.accessToken = ACCESS_TOKEN;
    }

    private async request(
        method: string,
        path: string,
        body?: unknown
    ): Promise<unknown> {
        const url = `${this.baseUrl}${path}`;
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "UCP-Agent": "a2a-server/1.0 (ucp-shopify-bridge)",
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
        return this.request(
            "PUT",
            `/checkout-sessions/${encodeURIComponent(id)}`,
            params
        );
    }

    async completeCheckout(id: string): Promise<unknown> {
        return this.request(
            "POST",
            `/checkout-sessions/${encodeURIComponent(id)}/complete`
        );
    }

    async cancelCheckout(id: string): Promise<unknown> {
        return this.request(
            "POST",
            `/checkout-sessions/${encodeURIComponent(id)}/cancel`
        );
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
// Agent Executor
// ============================================================================

const ucpClient = new UCPRestClient();

interface ParsedIntent {
    skill: string;
    action: string;
    params: Record<string, unknown>;
}

/**
 * Parse user message to determine intent and extract parameters
 */
function parseUserMessage(text: string): ParsedIntent {
    const lowerText = text.toLowerCase();

    // Checkout intents
    if (
        lowerText.includes("create") &&
        (lowerText.includes("checkout") || lowerText.includes("session"))
    ) {
        return { skill: "ucp-checkout", action: "create", params: {} };
    }
    if (
        lowerText.includes("get") &&
        (lowerText.includes("checkout") || lowerText.includes("session"))
    ) {
        const idMatch = text.match(/(?:session|checkout)\s+([a-zA-Z0-9_-]+)/i);
        return {
            skill: "ucp-checkout",
            action: "get",
            params: { id: idMatch?.[1] || "" },
        };
    }
    if (
        lowerText.includes("complete") &&
        (lowerText.includes("checkout") || lowerText.includes("session"))
    ) {
        const idMatch = text.match(/(?:session|checkout)\s+([a-zA-Z0-9_-]+)/i);
        return {
            skill: "ucp-checkout",
            action: "complete",
            params: { id: idMatch?.[1] || "" },
        };
    }
    if (
        lowerText.includes("cancel") &&
        (lowerText.includes("checkout") || lowerText.includes("session"))
    ) {
        const idMatch = text.match(/(?:session|checkout)\s+([a-zA-Z0-9_-]+)/i);
        return {
            skill: "ucp-checkout",
            action: "cancel",
            params: { id: idMatch?.[1] || "" },
        };
    }

    // Cart intents
    if (lowerText.includes("create") && lowerText.includes("cart")) {
        return { skill: "ucp-cart", action: "create", params: {} };
    }
    if (lowerText.includes("get") && lowerText.includes("cart")) {
        const idMatch = text.match(/cart\s+([a-zA-Z0-9_-]+)/i);
        return {
            skill: "ucp-cart",
            action: "get",
            params: { id: idMatch?.[1] || "" },
        };
    }
    if (lowerText.includes("delete") && lowerText.includes("cart")) {
        const idMatch = text.match(/cart\s+([a-zA-Z0-9_-]+)/i);
        return {
            skill: "ucp-cart",
            action: "delete",
            params: { id: idMatch?.[1] || "" },
        };
    }

    // Order intents
    if (
        lowerText.includes("list") &&
        (lowerText.includes("order") || lowerText.includes("orders"))
    ) {
        return { skill: "ucp-order", action: "list", params: {} };
    }
    if (lowerText.includes("get") && lowerText.includes("order")) {
        const idMatch = text.match(/order\s+([a-zA-Z0-9#_-]+)/i);
        return {
            skill: "ucp-order",
            action: "get",
            params: { id: idMatch?.[1]?.replace("#", "") || "" },
        };
    }

    // Default: describe capabilities
    return { skill: "help", action: "describe", params: {} };
}

/**
 * Get help message describing agent capabilities
 */
function getHelpMessage(): string {
    return `I am the UCP Shopify Bridge Agent. I can help you with:

**Checkout Management (ucp-checkout)**
- Create new checkout sessions with line items
- Retrieve checkout status and details
- Update buyer info and shipping addresses
- Complete checkouts to create orders
- Cancel incomplete checkout sessions

**Cart Operations (ucp-cart)**
- Create shopping carts with products
- View cart contents and totals
- Update cart line items
- Delete carts

**Order Retrieval (ucp-order)**
- Get order details by ID
- List recent orders
- Track fulfillment status

You can send me natural language requests or structured JSON with specific parameters.`;
}

class UCPAgentExecutor implements AgentExecutor {
    async execute(
        requestContext: RequestContext,
        eventBus: ExecutionEventBus
    ): Promise<void> {
        try {
            // Extract text from incoming message
            const incomingMessage = requestContext.userMessage;
            let userText = "";
            let structuredData: Record<string, unknown> | null = null;

            for (const part of incomingMessage.parts) {
                if (part.kind === "text") {
                    userText += (part as { kind: "text"; text: string }).text + " ";
                } else if (part.kind === "data") {
                    structuredData = (part as { kind: "data"; data: Record<string, unknown> }).data;
                }
            }

            userText = userText.trim();

            // Parse intent from message
            const intent = parseUserMessage(userText);
            let responseText: string;
            let responseData: unknown = null;

            if (intent.skill === "help") {
                responseText = getHelpMessage();
            } else {
                // Execute the appropriate UCP operation
                try {
                    switch (intent.skill) {
                        case "ucp-checkout":
                            responseData = await this.handleCheckout(
                                intent.action,
                                intent.params,
                                structuredData
                            );
                            responseText = `Checkout ${intent.action} completed successfully.`;
                            break;
                        case "ucp-cart":
                            responseData = await this.handleCart(
                                intent.action,
                                intent.params,
                                structuredData
                            );
                            responseText = `Cart ${intent.action} completed successfully.`;
                            break;
                        case "ucp-order":
                            responseData = await this.handleOrder(
                                intent.action,
                                intent.params
                            );
                            responseText = `Order ${intent.action} completed successfully.`;
                            break;
                        default:
                            responseText = getHelpMessage();
                    }
                } catch (error) {
                    const errorMessage =
                        error instanceof Error ? error.message : String(error);
                    responseText = `Error executing ${intent.skill}/${intent.action}: ${errorMessage}`;
                }
            }

            // Build response parts
            const parts: Part[] = [{ kind: "text", text: responseText }];

            if (responseData) {
                parts.push({
                    kind: "data",
                    data: responseData as Record<string, unknown>,
                });
            }

            // Create response message
            const responseMessage: Message = {
                kind: "message",
                messageId: uuidv4(),
                role: "agent",
                parts,
                contextId: requestContext.contextId,
            };

            eventBus.publish(responseMessage);
            eventBus.finished();
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            const errorResponse: Message = {
                kind: "message",
                messageId: uuidv4(),
                role: "agent",
                parts: [{ kind: "text", text: `Agent error: ${errorMessage}` }],
                contextId: requestContext.contextId,
            };
            eventBus.publish(errorResponse);
            eventBus.finished();
        }
    }

    private async handleCheckout(
        action: string,
        params: Record<string, unknown>,
        data: Record<string, unknown> | null
    ): Promise<unknown> {
        switch (action) {
            case "create":
                return ucpClient.createCheckout(data || { line_items: [] });
            case "get":
                if (!params.id) throw new Error("Checkout ID required");
                return ucpClient.getCheckout(params.id as string);
            case "update":
                if (!params.id) throw new Error("Checkout ID required");
                return ucpClient.updateCheckout(params.id as string, data || {});
            case "complete":
                if (!params.id) throw new Error("Checkout ID required");
                return ucpClient.completeCheckout(params.id as string);
            case "cancel":
                if (!params.id) throw new Error("Checkout ID required");
                return ucpClient.cancelCheckout(params.id as string);
            default:
                throw new Error(`Unknown checkout action: ${action}`);
        }
    }

    private async handleCart(
        action: string,
        params: Record<string, unknown>,
        data: Record<string, unknown> | null
    ): Promise<unknown> {
        switch (action) {
            case "create":
                return ucpClient.createCart(data || { line_items: [] });
            case "get":
                if (!params.id) throw new Error("Cart ID required");
                return ucpClient.getCart(params.id as string);
            case "update":
                if (!params.id) throw new Error("Cart ID required");
                return ucpClient.updateCart(params.id as string, data || {});
            case "delete":
                if (!params.id) throw new Error("Cart ID required");
                return ucpClient.deleteCart(params.id as string);
            default:
                throw new Error(`Unknown cart action: ${action}`);
        }
    }

    private async handleOrder(
        action: string,
        params: Record<string, unknown>
    ): Promise<unknown> {
        switch (action) {
            case "get":
                if (!params.id) throw new Error("Order ID required");
                return ucpClient.getOrder(params.id as string);
            case "list":
                return ucpClient.listOrders();
            default:
                throw new Error(`Unknown order action: ${action}`);
        }
    }

    // Cancel task handler (not needed for simple operations)
    cancelTask = async (): Promise<void> => { };
}

// ============================================================================
// Express Server Setup
// ============================================================================

const agentExecutor = new UCPAgentExecutor();
const requestHandler = new DefaultRequestHandler(
    ucpAgentCard,
    new InMemoryTaskStore(),
    agentExecutor
);

const app = express();

// Parse JSON bodies
app.use(express.json());

// CORS middleware for AI agents
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
        res.sendStatus(200);
        return;
    }
    next();
});

// Agent Card discovery endpoint (standard well-known path)
app.use(
    `/${AGENT_CARD_PATH}`,
    agentCardHandler({ agentCardProvider: requestHandler })
);

// Also serve at /.well-known/agent-card.json for convenience
app.get("/.well-known/agent-card.json", (req, res) => {
    res.json(ucpAgentCard);
});

// JSON-RPC endpoint
app.use(
    "/a2a/jsonrpc",
    jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication })
);

// HTTP+JSON/REST endpoint
app.use(
    "/a2a/rest",
    restHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication })
);

// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok", agent: ucpAgentCard.name });
});

// ============================================================================
// Startup
// ============================================================================

app.listen(PORT, () => {
    console.log(`
╔═════════════════════════════════════════════════════════════════╗
║                   UCP A2A Server Running                        ║
╠═════════════════════════════════════════════════════════════════╣
║                                                                 ║
║  Agent Card:   http://localhost:${PORT}/.well-known/agent-card.json  ║
║  JSON-RPC:     http://localhost:${PORT}/a2a/jsonrpc                  ║
║  REST:         http://localhost:${PORT}/a2a/rest                     ║
║  Health:       http://localhost:${PORT}/health                       ║
║                                                                 ║
║  UCP Backend:  ${STORE_URL.padEnd(42)}  ║
║                                                                 ║
║  Skills:                                                        ║
║    • ucp-checkout - Checkout session management                 ║
║    • ucp-cart     - Cart operations                             ║
║    • ucp-order    - Order retrieval                             ║
║                                                                 ║
╚═════════════════════════════════════════════════════════════════╝
`);
});
