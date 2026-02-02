import { json } from "@remix-run/node";

export interface UCPHeaders {
    ucpAgent?: string;
    ucpPlatformProfile?: string;
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
