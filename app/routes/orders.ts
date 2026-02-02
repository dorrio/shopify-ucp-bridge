import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { OrderService } from "../services/ucp";
import { formatUCPOrderResponse } from "../utils/ucpTransformers";
import { validateUCPHeaders } from "../utils/ucpMiddleware";

/**
 * UCP Orders Endpoint - REST Binding
 * 
 * GET /orders  - List orders
 */

export async function loader({ request }: LoaderFunctionArgs) {
    const { admin } = await authenticate.admin(request);

    // Validate UCP Headers
    const headerValidation = validateUCPHeaders(request, true);
    if (headerValidation instanceof Response) return headerValidation;

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "20");

    const orderService = new OrderService(admin);

    try {
        const orders = await orderService.listOrders(limit);
        const formattedOrders = orders.map(order => formatUCPOrderResponse(order));

        return json({
            ucp: {
                version: "2026-01-01",
            },
            orders: formattedOrders,
            total: formattedOrders.length,
        });
    } catch (error) {
        console.error("UCP Orders API error:", error);
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
