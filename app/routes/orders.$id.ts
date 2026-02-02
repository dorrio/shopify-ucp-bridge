import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { OrderService } from "../services/ucp";
import { formatUCPOrderResponse } from "../utils/ucpTransformers";
import { validateUCPHeaders } from "../utils/ucpMiddleware";

/**
 * UCP Order Detail - REST Binding
 * 
 * GET /orders/:id  - Get order by ID
 */

export async function loader({ request, params }: LoaderFunctionArgs) {
    const { admin } = await authenticate.admin(request);

    // Validate UCP Headers
    const headerValidation = validateUCPHeaders(request, true);
    if (headerValidation instanceof Response) return headerValidation;

    const orderId = params.id;

    if (!orderId) {
        return json(
            {
                status: "error",
                messages: [{
                    type: "error",
                    code: "missing_id",
                    content: "Order ID is required",
                    severity: "recoverable",
                }],
            },
            { status: 400 }
        );
    }

    const orderService = new OrderService(admin);

    try {
        const order = await orderService.getOrder(orderId);

        if (!order) {
            return json(
                {
                    status: "error",
                    messages: [{
                        type: "error",
                        code: "not_found",
                        content: "Order not found",
                        severity: "recoverable",
                    }],
                },
                { status: 404 }
            );
        }

        const ucpResponse = formatUCPOrderResponse(order);
        return json(ucpResponse);
    } catch (error) {
        console.error("UCP Order API error:", error);
        return json(
            {
                status: "error",
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
