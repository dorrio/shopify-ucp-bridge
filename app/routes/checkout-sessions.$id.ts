import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { CheckoutService } from "../services/ucp";
import type { UCPCheckoutUpdateRequest } from "../services/ucp";
import { parseUCPLineItems, formatUCPCheckoutResponse } from "../utils/ucpTransformers";
import { validateUCPHeaders } from "../utils/ucpMiddleware";

/**
 * UCP Checkout Session Detail - REST Binding
 * https://ucp.dev/latest/specification/checkout-rest/
 * 
 * GET    /checkout-sessions/:id  - Get checkout session
 * PUT    /checkout-sessions/:id  - Update checkout session (full replace)
 */

export async function loader({ request, params }: LoaderFunctionArgs) {
    const { admin } = await authenticate.admin(request);

    // Validate UCP Headers
    const headerValidation = validateUCPHeaders(request, true);
    if (headerValidation instanceof Response) return headerValidation;

    const checkoutId = params.id;

    if (!checkoutId) {
        return json(
            {
                status: "canceled",
                messages: [{
                    type: "error",
                    code: "missing_id",
                    content: "Checkout session ID is required",
                    severity: "recoverable",
                }],
            },
            { status: 400 }
        );
    }

    const checkoutService = new CheckoutService(admin);

    try {
        const checkout = await checkoutService.getCheckout(checkoutId);

        if (!checkout) {
            return json(
                {
                    status: "canceled",
                    messages: [{
                        type: "error",
                        code: "not_found",
                        content: "Checkout session not found",
                        severity: "recoverable",
                    }],
                },
                { status: 404 }
            );
        }

        // Transform response to UCP format (minor units)
        const ucpResponse = formatUCPCheckoutResponse(checkout);

        return json(ucpResponse);
    } catch (error) {
        console.error("UCP Checkout Session API error:", error);
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

export async function action({ request, params }: ActionFunctionArgs) {
    const { admin } = await authenticate.admin(request);

    // Validate UCP Headers
    const headerValidation = validateUCPHeaders(request, true);
    if (headerValidation instanceof Response) return headerValidation;

    const checkoutId = params.id;

    if (!checkoutId) {
        return json(
            {
                status: "canceled",
                messages: [{
                    type: "error",
                    code: "missing_id",
                    content: "Checkout session ID is required",
                    severity: "recoverable",
                }],
            },
            { status: 400 }
        );
    }

    const checkoutService = new CheckoutService(admin);

    try {
        const method = request.method.toUpperCase();

        if (method === "PUT") {
            // PUT /checkout-sessions/:id - Update checkout (full replace)
            const rawBody = await request.json();

            // Transform UCP line_items (minor units) to internal format
            const parsedBody = parseUCPLineItems(rawBody);
            const ucpRequest: UCPCheckoutUpdateRequest = {
                ...parsedBody,
                id: checkoutId,
            };

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

            const checkout = await checkoutService.updateCheckout(ucpRequest);

            // Transform response to UCP format (minor units)
            const ucpResponse = formatUCPCheckoutResponse(checkout);

            return json(ucpResponse);
        }

        return json(
            {
                status: "canceled",
                messages: [{
                    type: "error",
                    code: "method_not_allowed",
                    content: "Method not allowed. Use GET or PUT.",
                    severity: "recoverable",
                }],
            },
            { status: 405 }
        );
    } catch (error) {
        console.error("UCP Checkout Session API error:", error);
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
