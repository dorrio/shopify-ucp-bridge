import { json } from "@remix-run/node";

export interface UCPHeaders {
    ucpAgent?: string;
    ucpPlatformProfile?: string;
}

/**
 * UCP Meta object structure
 * https://ucp.dev/latest/specification/checkout-mcp/#request-metadata
 */
export interface UCPMeta {
    "ucp-agent"?: {
        profile?: string;
    };
    "idempotency-key"?: string;
}

/**
 * Validated UCP Meta result
 */
export interface UCPMetaValidation {
    valid: true;
    meta: UCPMeta;
    idempotencyKey?: string;
}

/**
 * UUID v4 regex pattern
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate UUID format
 */
export function isValidUUID(value: string): boolean {
    return UUID_REGEX.test(value);
}

/**
 * Validate UCP meta object from request body
 * Used for complete_checkout and cancel_checkout which require idempotency-key
 * 
 * @param body The parsed request body
 * @param requireIdempotencyKey If true, idempotency-key is required
 */
export function validateUCPMeta(
    body: { meta?: UCPMeta } | null | undefined,
    requireIdempotencyKey = false
): UCPMetaValidation | Response {
    const meta = body?.meta;

    if (requireIdempotencyKey) {
        if (!meta || !meta["idempotency-key"]) {
            return json(
                {
                    status: "canceled",
                    messages: [{
                        type: "error",
                        code: "missing_idempotency_key",
                        content: "Missing required field: meta.idempotency-key. This is required for retry safety.",
                        severity: "recoverable",
                    }],
                },
                { status: 400 }
            );
        }

        const idempotencyKey = meta["idempotency-key"];
        if (!isValidUUID(idempotencyKey)) {
            return json(
                {
                    status: "canceled",
                    messages: [{
                        type: "error",
                        code: "invalid_idempotency_key",
                        content: "Invalid idempotency-key format. Must be a valid UUID v4.",
                        severity: "recoverable",
                    }],
                },
                { status: 400 }
            );
        }

        return {
            valid: true,
            meta,
            idempotencyKey,
        };
    }

    return {
        valid: true,
        meta: meta || {},
    };
}

/**
 * Parsed UCP Agent header structure
 * Format: "AgentName/1.0 (Platform/2.0; +https://platform.com/profile)"
 */
export interface UCPAgentInfo {
    name: string;
    version: string;
    platform?: string;
    platformVersion?: string;
    profileUrl?: string;
}

/**
 * Parse the UCP-Agent header
 * Example: "MyAgent/1.0 (Shopify/2.0; +https://shopify.com/profile)"
 */
export function parseUCPAgentHeader(header: string): UCPAgentInfo | null {
    if (!header) return null;

    // Basic regex to capture Name/Version and optional comment
    // This is a simplified parser
    const parts = header.split(" ");
    const product = parts[0]?.split("/");

    if (!product || product.length !== 2) return null;

    const info: UCPAgentInfo = {
        name: product[0],
        version: product[1],
    };

    // Extract URL from comment if present: (+http...)
    const urlMatch = header.match(/\(\+?(https?:\/\/[^)]+)\)/);
    if (urlMatch) {
        info.profileUrl = urlMatch[1];
    }

    return info;
}

/**
 * Validate incoming requests for UCP compliance
 * 
 * @param request The incoming Request object
 * @param requireAgent If true, strictly require the UCP-Agent header (default: false for now to allow loose testing)
 */
export function validateUCPHeaders(request: Request, requireAgent = false): UCPHeaders | Response {
    const ucpAgent = request.headers.get("UCP-Agent");

    if (requireAgent && !ucpAgent) {
        return json(
            {
                status: "canceled",
                messages: [{
                    type: "error",
                    code: "missing_header",
                    content: "Missing required header: UCP-Agent",
                    severity: "recoverable",
                }],
            },
            { status: 400 }
        );
    }

    let ucpPlatformProfile: string | undefined;

    if (ucpAgent) {
        const agentInfo = parseUCPAgentHeader(ucpAgent);
        if (agentInfo?.profileUrl) {
            ucpPlatformProfile = agentInfo.profileUrl;
        }
    }

    return {
        ucpAgent: ucpAgent || undefined,
        ucpPlatformProfile,
    };
}
