import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { CartService } from "../services/ucp";
import type { UCPCartCreateRequest, UCPCartUpdateRequest } from "../services/ucp";
import { parseUCPLineItems, formatUCPCartResponse } from "../utils/ucpTransformers";

/**
 * UCP Cart Endpoint - REST Binding
 * 
 * POST   /carts         - Create new cart
 * GET    /carts         - List carts
 */

export async function loader({ request }: LoaderFunctionArgs) {
    const { admin } = await authenticate.admin(request);
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "20");

    const cartService = new CartService(admin);

    try {
        const carts = await cartService.listCarts(limit);
        const formattedCarts = carts.map(cart => formatUCPCartResponse(cart));

        return json({
            ucp: {
                version: "2026-01-01",
            },
            carts: formattedCarts,
            total: formattedCarts.length,
        });
    } catch (error) {
        console.error("UCP Carts API error:", error);
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

export async function action({ request }: ActionFunctionArgs) {
    const { admin } = await authenticate.admin(request);
    const cartService = new CartService(admin);

    try {
        const method = request.method.toUpperCase();

        if (method === "POST") {
            // POST /carts - Create cart
            const rawBody = await request.json();
            const ucpRequest = parseUCPLineItems(rawBody) as UCPCartCreateRequest;

            if (!ucpRequest.line_items || ucpRequest.line_items.length === 0) {
                return json(
                    {
                        status: "error",
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

            const cart = await cartService.createCart(ucpRequest);
            const ucpResponse = formatUCPCartResponse(cart);

            return json(ucpResponse, { status: 201 });
        }

        return json(
            {
                status: "error",
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
        console.error("UCP Carts API error:", error);
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
