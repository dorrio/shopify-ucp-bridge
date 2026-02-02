import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { CheckoutService } from "../services/ucp";
import { formatUCPCheckoutResponse } from "../utils/ucpTransformers";
import { validateUCPMeta, type UCPMeta } from "../utils/ucpMiddleware";

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
            // UCP spec requires idempotency-key for cancel_checkout

            // Check for body content first
            let body: { meta?: UCPMeta } = {};
            try {
                body = await request.json();
            } catch {
                // Empty body is NOT acceptable for cancel - idempotency-key is required
                return json(
                    {
                        status: "canceled",
                        messages: [{
                            type: "error",
                            code: "missing_idempotency_key",
                            content: "Request body with meta.idempotency-key is required",
                            severity: "recoverable",
                        }],
                    },
                    { status: 400 }
                );
            }

            // Validate meta.idempotency-key per UCP MCP binding spec
            const metaValidation = validateUCPMeta(body, true);
            if (metaValidation instanceof Response) {
                return metaValidation;
            }

            console.log(`[UCP Cancel] Checkout ${checkoutId} with idempotency-key: ${metaValidation.idempotencyKey}`);

            try {
                const result = await checkoutService.cancelCheckout(checkoutId);

                // Return full canceled checkout response per UCP spec
                const ucpResponse = formatUCPCheckoutResponse(result);
                return json(ucpResponse);
            } catch (error) {
                // If checkout not found or already deleted
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
