
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticateUCP } from "../utils/ucp-auth.server";
import { CheckoutService } from "../services/ucp";
import type { UCPCheckoutCreateRequest } from "../services/ucp";
import { parseUCPLineItems, formatUCPCheckoutResponse } from "../utils/ucpTransformers";
import { validateUCPHeaders, negotiateCapabilities } from "../utils/ucpMiddleware";
import config from "../../ucp.config.json";
import type { UCPConfig } from "../types/ucp-config";

/**
 * UCP Checkout Sessions Endpoint - REST Binding
 * https://ucp.dev/latest/specification/checkout-rest/
 * 
 * POST   /checkout-sessions  - Create new checkout session
 * GET    /checkout-sessions  - List checkout sessions (optional)
 */

export async function loader({ request }: LoaderFunctionArgs) {
    const { admin } = await authenticateUCP(request);

    // Validate UCP Headers
    const headerValidation = validateUCPHeaders(request, true);
    if (headerValidation instanceof Response) return headerValidation;

    // Negotiate capabilities
    const ucpConfig = config as unknown as UCPConfig;
    const negotiation = negotiateCapabilities(ucpConfig);

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "20");

    const checkoutService = new CheckoutService(admin);

    try {
        // List checkouts - Not in core UCP spec but useful for debugging
        // For now, return empty list as DraftOrders don't have a "checkout" filter
        return json({
            ucp: {
                version: ucpConfig.ucp_version,
                negotiation
            },
            checkout_sessions: [],
            total: 0,
        });
    } catch (error) {
        console.error("UCP Checkout Sessions API error:", error);
        return json(
            {
                status: "canceled",
                messages: [{
                    type: "error",
                    code: "internal_error",
                    content: error instanceof Error ? error.message : "Internal server error",
                    severity: "recoverable",
                }],
            },
            { status: 500 }
        );
    }
}

export async function action({ request }: ActionFunctionArgs) {
    const { admin } = await authenticateUCP(request);

    // Validate UCP Headers
    const headerValidation = validateUCPHeaders(request, true);
    if (headerValidation instanceof Response) return headerValidation;

    // Negotiate capabilities
    const ucpConfig = config as unknown as UCPConfig;
    const negotiation = negotiateCapabilities(ucpConfig);

    const checkoutService = new CheckoutService(admin);

    try {
        const method = request.method.toUpperCase();

        if (method === "POST") {
            // POST /checkout-sessions - Create checkout
            const rawBody = await request.json();

            // Transform UCP line_items (minor units) to internal format
            const ucpRequest = parseUCPLineItems(rawBody) as UCPCheckoutCreateRequest;

            if (!ucpRequest.line_items || ucpRequest.line_items.length === 0) {
                return json(
                    {
                        status: "canceled",
                        messages: [{
                            type: "error",
                            code: "invalid_line_items",
                            content: "line_items is required and must not be empty",
                            severity: "recoverable",
                        }],
                    },
                    { status: 400 }
                );
            }

            const checkout = await checkoutService.createCheckout(ucpRequest);

            // Transform response to UCP format (minor units)
            const ucpResponse = formatUCPCheckoutResponse(checkout);

            // Inject negotiation into the response wrapper
            // formatUCPCheckoutResponse returns an object with 'ucp' property, we merge existing ucp metadata
            ucpResponse.ucp = {
                ...ucpResponse.ucp,
                negotiation
            };

            return json(ucpResponse, { status: 201 });
        }

        return json(
            {
                status: "canceled",
                messages: [{
                    type: "error",
                    code: "method_not_allowed",
                    content: "Method not allowed",
                    severity: "recoverable",
                }],
            },
            { status: 405 }
        );
    } catch (error) {
        console.error("UCP Checkout Sessions API error:", error);
        return json(
            {
                status: "canceled",
                messages: [{
                    type: "error",
                    code: "internal_error",
                    content: error instanceof Error ? error.message : "Internal server error",
                    severity: "recoverable",
                }],
            },
            { status: 500 }
        );
    }
}
