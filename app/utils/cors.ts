import { json } from "@remix-run/node";

/**
 * CORS Middleware for UCP Endpoints
 * 
 * Enables browser-based AI agents to access UCP endpoints directly.
 * Allows cross-origin requests from any origin with the UCP-Agent header.
 */

export interface CORSOptions {
    allowedOrigins?: string[] | "*";
    allowedMethods?: string[];
    allowedHeaders?: string[];
    exposeHeaders?: string[];
    maxAge?: number;
    credentials?: boolean;
}

const DEFAULT_UCP_CORS_OPTIONS: CORSOptions = {
    allowedOrigins: "*", // Allow all origins for UCP agents
    allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "UCP-Agent",           // UCP platform identification
        "UCP-Request-Id",      // Request tracking
        "X-Requested-With",
    ],
    exposeHeaders: [
        "UCP-Request-Id",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
    ],
    maxAge: 86400, // 24 hours preflight cache
    credentials: false, // UCP uses token auth, not cookies
};

/**
 * Build CORS headers from options
 */
export function buildCORSHeaders(
    request: Request,
    options: CORSOptions = DEFAULT_UCP_CORS_OPTIONS
): Record<string, string> {
    const origin = request.headers.get("Origin");
    const headers: Record<string, string> = {};

    // Access-Control-Allow-Origin
    if (options.allowedOrigins === "*") {
        headers["Access-Control-Allow-Origin"] = "*";
    } else if (origin && options.allowedOrigins?.includes(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
        headers["Vary"] = "Origin";
    }

    // Access-Control-Allow-Methods
    if (options.allowedMethods) {
        headers["Access-Control-Allow-Methods"] = options.allowedMethods.join(", ");
    }

    // Access-Control-Allow-Headers
    if (options.allowedHeaders) {
        headers["Access-Control-Allow-Headers"] = options.allowedHeaders.join(", ");
    }

    // Access-Control-Expose-Headers
    if (options.exposeHeaders) {
        headers["Access-Control-Expose-Headers"] = options.exposeHeaders.join(", ");
    }

    // Access-Control-Max-Age
    if (options.maxAge !== undefined) {
        headers["Access-Control-Max-Age"] = options.maxAge.toString();
    }

    // Access-Control-Allow-Credentials
    if (options.credentials) {
        headers["Access-Control-Allow-Credentials"] = "true";
    }

    return headers;
}

/**
 * Handle CORS preflight OPTIONS request
 */
export function handleCORSPreflight(
    request: Request,
    options: CORSOptions = DEFAULT_UCP_CORS_OPTIONS
): Response | null {
    if (request.method !== "OPTIONS") {
        return null;
    }

    const corsHeaders = buildCORSHeaders(request, options);

    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    });
}

/**
 * Wrap a Response with CORS headers
 */
export function withCORS(
    response: Response,
    request: Request,
    options: CORSOptions = DEFAULT_UCP_CORS_OPTIONS
): Response {
    const corsHeaders = buildCORSHeaders(request, options);

    // Clone response and add CORS headers
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
        newHeaders.set(key, value);
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}

/**
 * JSON response with CORS headers
 */
export function corsJson<T>(
    data: T,
    request: Request,
    init?: ResponseInit,
    options: CORSOptions = DEFAULT_UCP_CORS_OPTIONS
): Response {
    const response = json(data, init);
    return withCORS(response, request, options);
}

export { DEFAULT_UCP_CORS_OPTIONS };
