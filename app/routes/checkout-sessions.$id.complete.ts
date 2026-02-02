import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { CheckoutService } from "../services/ucp";
import type { UCPCheckoutCompleteRequest } from "../services/ucp";
import { formatUCPCheckoutResponse } from "../utils/ucpTransformers";
import { validateUCPMeta, type UCPMeta } from "../utils/ucpMiddleware";

/**
 * UCP Checkout Complete - REST Binding
 * https://ucp.dev/latest/specification/checkout-rest/
 * 
 * POST   /checkout-sessions/:id/complete  - Complete checkout session
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
            // POST /checkout-sessions/:id/complete - Complete checkout
            // UCP spec requires idempotency-key for complete_checkout
            let body: UCPCheckoutCompleteRequest & { meta?: UCPMeta } = { payment: {} };

            try {
                body = await request.json() as UCPCheckoutCompleteRequest & { meta?: UCPMeta };
            } catch {
                // Empty body is NOT acceptable for complete - idempotency-key is required
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

            console.log(`[UCP Complete] Checkout ${checkoutId} with idempotency-key: ${metaValidation.idempotencyKey}`);

            const checkout = await checkoutService.completeCheckout(checkoutId, body);

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
                    content: "Method not allowed. Use POST.",
                    severity: "recoverable",
                }],
            },
            { status: 405 }
        );
    } catch (error) {
        console.error("UCP Checkout Complete API error:", error);
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
