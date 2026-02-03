import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticateUCP } from "../utils/ucp-auth.server";
import { MCPService, MCP_TOOLS } from "../services/mcp.server";

/**
 * MCP Endpoint - Model Context Protocol for UCP Shopify Bridge
 * 
 * Implements MCP Streamable HTTP transport for AI agent integration.
 * 
 * Endpoints:
 *   GET  /api/mcp - Server info and capabilities
 *   POST /api/mcp - Handle JSON-RPC requests
 * 
 * Compatible with:
 *   - Antigravity (Google Gemini)
 *   - VS Code MCP extensions
 *   - ChatGPT plugins
 *   - Any MCP-compatible client
 */

// CORS headers for cross-origin requests
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-MCP-Session-Id",
};

/**
 * GET /api/mcp - Return server info and available tools
 */
export async function loader({ request }: LoaderFunctionArgs) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    }

    try {
        const { admin } = await authenticateUCP(request);
        const mcpService = new MCPService(admin);

        return json(
            {
                name: "ucp-shopify-bridge",
                version: "1.0.0",
                protocolVersion: "2024-11-05",
                description: "Universal Commerce Protocol bridge for Shopify stores",
                transport: "streamable-http",
                endpoints: {
                    rpc: "/api/mcp",
                },
                capabilities: {
                    tools: MCP_TOOLS.map(t => ({ name: t.name, description: t.description })),
                },
                instructions: `
This MCP server provides shopping capabilities for a Shopify store via the Universal Commerce Protocol (UCP).

Available operations:
- Checkout: create_checkout, get_checkout, update_checkout, complete_checkout, cancel_checkout
- Cart: create_cart, get_cart, update_cart, delete_cart  
- Orders: get_order, list_orders

Use JSON-RPC 2.0 format for tool calls via POST.
                `.trim(),
            },
            {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                },
            }
        );
    } catch (error) {
        console.error("MCP loader error:", error);
        return json(
            {
                error: {
                    code: -32000,
                    message: "Authentication failed. Please ensure the Shopify app is installed.",
                },
            },
            {
                status: 401,
                headers: corsHeaders,
            }
        );
    }
}

/**
 * POST /api/mcp - Handle JSON-RPC requests
 * 
 * Discovery methods (initialize, tools/list, ping) work without authentication.
 * Tool calls (tools/call) require Shopify authentication.
 */
export async function action({ request }: ActionFunctionArgs) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return json(
            {
                jsonrpc: "2.0",
                id: null,
                error: {
                    code: -32700,
                    message: "Parse error: Invalid JSON",
                },
            },
            {
                status: 400,
                headers: corsHeaders,
            }
        );
    }

    // Check if this is an unauthenticated-safe method
    const isPublicMethod = (method: string) =>
        ["initialize", "tools/list", "ping"].includes(method);

    // Handle batch requests
    if (Array.isArray(body)) {
        const requiresAuth = body.some(req => !isPublicMethod(req.method));

        if (requiresAuth) {
            try {
                const { admin } = await authenticateUCP(request);
                const mcpService = new MCPService(admin);
                const responses = await Promise.all(
                    body.map((req) => mcpService.handleRequest(req))
                );
                return json(responses, { headers: corsHeaders });
            } catch (error) {
                return json(
                    body.map(req => ({
                        jsonrpc: "2.0",
                        id: req.id ?? null,
                        error: {
                            code: -32000,
                            message: "Authentication required for this method",
                        },
                    })),
                    { headers: corsHeaders }
                );
            }
        } else {
            // All methods are public - can handle without admin
            const responses = body.map(req => handlePublicMethod(req));
            return json(responses, { headers: corsHeaders });
        }
    }

    // Handle single request
    const method = body.method;

    if (isPublicMethod(method)) {
        // Handle public methods without authentication
        const response = handlePublicMethod(body);
        return json(response, { headers: corsHeaders });
    }

    // Requires authentication for tool calls
    try {
        const { admin } = await authenticateUCP(request);
        const mcpService = new MCPService(admin);
        const response = await mcpService.handleRequest(body);
        return json(response, { headers: corsHeaders });
    } catch (error) {
        console.error("MCP action error:", error);
        return json(
            {
                jsonrpc: "2.0",
                id: body.id ?? null,
                error: {
                    code: -32000,
                    message: error instanceof Error ? error.message : "Authentication failed",
                },
            },
            {
                status: 401,
                headers: corsHeaders,
            }
        );
    }
}

/**
 * Handle public MCP methods that don't require authentication
 */
function handlePublicMethod(request: { jsonrpc: string; id?: string | number; method: string; params?: any }) {
    const { id, method, params } = request;

    switch (method) {
        case "initialize":
            return {
                jsonrpc: "2.0",
                id,
                result: {
                    protocolVersion: "2024-11-05",
                    serverInfo: {
                        name: "ucp-shopify-bridge",
                        version: "1.0.0",
                    },
                    capabilities: {
                        tools: {},
                    },
                },
            };

        case "tools/list":
            return {
                jsonrpc: "2.0",
                id,
                result: {
                    tools: MCP_TOOLS,
                },
            };

        case "ping":
            return {
                jsonrpc: "2.0",
                id,
                result: {},
            };

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
}
