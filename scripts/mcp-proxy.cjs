#!/usr/bin/env node
/**
 * MCP Proxy for UCP Shopify Bridge
 * 
 * This script acts as a local MCP server that proxies requests
 * to the remote HTTP-based MCP server on Vercel.
 * 
 * Usage: node mcp-proxy.cjs
 */

const readline = require('readline');
const https = require('https');

const REMOTE_URL = 'https://shopify-ucp-bridge.vercel.app/api/mcp';

// Queue to ensure responses are sent in order
let processingQueue = Promise.resolve();

// Read JSON-RPC messages from stdin
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

let buffer = '';

rl.on('line', (line) => {
    buffer += line;

    try {
        const request = JSON.parse(buffer);
        buffer = '';

        // Queue the request to ensure responses are sent in order
        processingQueue = processingQueue.then(async () => {
            await handleRequest(request);
        });
    } catch (e) {
        // Not complete JSON yet, keep buffering
        if (!(e instanceof SyntaxError)) {
            process.stderr.write(`Error: ${e.message}\n`);
        }
    }
});

async function handleRequest(request) {
    // MCP notifications don't have an id and shouldn't receive a response
    if (request.id === undefined || request.id === null) {
        // This is a notification (e.g., "notifications/initialized")
        // Just acknowledge internally, no response needed
        return;
    }

    // Forward request to remote server
    const response = await forwardRequest(request);

    // Write response to stdout (flush immediately)
    process.stdout.write(JSON.stringify(response) + '\n');
}

async function forwardRequest(request) {
    return new Promise((resolve) => {
        const data = JSON.stringify(request);

        const url = new URL(REMOTE_URL);
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
            },
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve({
                        jsonrpc: '2.0',
                        id: request.id,
                        error: {
                            code: -32000,
                            message: `Invalid response: ${body}`,
                        },
                    });
                }
            });
        });

        req.on('error', (e) => {
            resolve({
                jsonrpc: '2.0',
                id: request.id,
                error: {
                    code: -32000,
                    message: `Network error: ${e.message}`,
                },
            });
        });

        // Set a timeout to avoid hanging
        req.setTimeout(30000, () => {
            req.destroy();
            resolve({
                jsonrpc: '2.0',
                id: request.id,
                error: {
                    code: -32000,
                    message: 'Request timeout',
                },
            });
        });

        req.write(data);
        req.end();
    });
}

// Handle process termination gracefully
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// Keep process alive
process.stdin.resume();
