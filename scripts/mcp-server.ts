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
 *   BRIDGE_URL - URL of the running Remix application (default: http://localhost:3000)
 *   BRIDGE_ACCESS_TOKEN - Optional token if bridge endpoints are protected
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
