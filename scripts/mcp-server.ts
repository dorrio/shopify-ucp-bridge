#!/usr/bin/env npx tsx

/**
 * MCP Server for UCP Shopify Bridge (Stdio Transport)
 * 
 * This server exposes UCP shopping capabilities as MCP tools via stdio.
 * 
 * Usage:
 *   pnpm run mcp
 * 
 * Configuration (environment variables):
 *   SHOPIFY_STORE_URL - Your myshopify.com store URL
 *   SHOPIFY_ACCESS_TOKEN - Admin API access token
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createUcpMcpServer } from "./mcp-core.js";

async function main() {
    const server = createUcpMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("UCP MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
