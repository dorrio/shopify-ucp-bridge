import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { CheckoutService } from "../services/ucp";
import { formatUCPCheckoutResponse } from "../utils/ucpTransformers";

/**
 * UCP Checkout Cancel - REST Binding
 * https://ucp.dev/latest/specification/checkout-rest/
 * 
 * POST   /checkout-sessions/:id/cancel  - Cancel checkout session
 */

export async function action({ request, params }: ActionFunctionArgs) {
    const { admin } = await authenticate.admin(request);
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

        if (method === "POST") {
            // POST /checkout-sessions/:id/cancel - Cancel checkout
            const result = await checkoutService.cancelCheckout(checkoutId);

            if (!result.canceled) {
                return json(
                    {
                        status: "canceled",
                        messages: [{
                            type: "error",
                            code: "not_found",
                            content: "Checkout session not found or could not be canceled",
                            severity: "recoverable",
                        }],
                    },
                    { status: 404 }
                );
            }

            // Return canceled checkout response
            return json({
                ucp: {
                    version: "2026-01-01",
                    capabilities: {
                        "dev.ucp.shopping.checkout": [{
                            version: "2026-01-01",
                            spec: "https://ucp.dev/specification/checkout",
                        }],
                    },
                },
                id: result.id,
                status: "canceled",
                messages: [{
                    type: "info",
                    code: "checkout_canceled",
                    content: "Checkout session has been canceled",
                }],
            });
        }

        return json(
            {
                status: "canceled",
                messages: [{
                    type: "error",
                    code: "method_not_allowed",
                    content: "Method not allowed. Use POST.",
                    severity: "recoverable",
                }],
            },
            { status: 405 }
        );
    } catch (error) {
        console.error("UCP Checkout Cancel API error:", error);
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
