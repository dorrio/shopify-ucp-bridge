#!/usr/bin/env npx tsx

/**
 * MCP Server for UCP Shopify Bridge (HTTP/SSE Transport)
 * 
 * This server exposes UCP shopping capabilities as MCP tools via HTTP/SSE.
 * 
 * Usage:
 *   pnpm run mcp:sse
 * 
 * Configuration (environment variables):
 *   port - Port to listen on (default: 3001)
 *   SHOPIFY_STORE_URL - Your myshopify.com store URL
 *   SHOPIFY_ACCESS_TOKEN - Admin API access token
 */

import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createUcpMcpServer } from "./mcp-core.js";

async function main() {
    const app = express();
    const port = process.env.PORT || 3001;
    const server = createUcpMcpServer();

    // Store active transport
    let transport: SSEServerTransport | undefined;

    app.get("/sse", async (req, res) => {
        console.log("New SSE connection established");
        transport = new SSEServerTransport("/messages", res);
        await server.connect(transport);
    });

    app.post("/messages", async (req, res) => {
        if (!transport) {
            res.sendStatus(400);
            return;
        }
        await transport.handlePostMessage(req, res);
    });

    app.listen(port, () => {
        console.log(`UCP MCP Server (SSE) running on http://localhost:${port}/sse`);
    });
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
