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
 */
export async function action({ request }: ActionFunctionArgs) {
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

        const body = await request.json();

        // Handle batch requests
        if (Array.isArray(body)) {
            const responses = await Promise.all(
                body.map((req) => mcpService.handleRequest(req))
            );
            return json(responses, { headers: corsHeaders });
        }

        // Handle single request
        const response = await mcpService.handleRequest(body);
        return json(response, { headers: corsHeaders });
    } catch (error) {
        console.error("MCP action error:", error);

        // Check if it's a JSON parse error
        if (error instanceof SyntaxError) {
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

        return json(
            {
                jsonrpc: "2.0",
                id: null,
                error: {
                    code: -32000,
                    message: error instanceof Error ? error.message : "Internal server error",
                },
            },
            {
                status: 500,
                headers: corsHeaders,
            }
        );
    }
}
