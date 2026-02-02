import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { CartService } from "../services/ucp";
import type { UCPCartUpdateRequest } from "../services/ucp";
import { parseUCPLineItems, formatUCPCartResponse } from "../utils/ucpTransformers";
import { validateUCPHeaders } from "../utils/ucpMiddleware";

/**
 * UCP Cart Detail - REST Binding
 * 
 * GET    /carts/:id  - Get cart
 * PUT    /carts/:id  - Update cart
 * DELETE /carts/:id  - Delete cart
 */

export async function loader({ request, params }: LoaderFunctionArgs) {
    const { admin } = await authenticate.admin(request);

    // Validate UCP Headers
    const headerValidation = validateUCPHeaders(request, true);
    if (headerValidation instanceof Response) return headerValidation;

    const cartId = params.id;

    if (!cartId) {
        return json(
            {
                status: "error",
                messages: [{
                    type: "error",
                    code: "missing_id",
                    content: "Cart ID is required",
                    severity: "recoverable",
                }],
            },
            { status: 400 }
        );
    }

    const cartService = new CartService(admin);

    try {
        const cart = await cartService.getCart(cartId);

        if (!cart) {
            return json(
                {
                    status: "error",
                    messages: [{
                        type: "error",
                        code: "not_found",
                        content: "Cart not found",
                        severity: "recoverable",
                    }],
                },
                { status: 404 }
            );
        }

        const ucpResponse = formatUCPCartResponse(cart);
        return json(ucpResponse);
    } catch (error) {
        console.error("UCP Cart API error:", error);
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

export async function action({ request, params }: ActionFunctionArgs) {
    const { admin } = await authenticate.admin(request);

    // Validate UCP Headers
    const headerValidation = validateUCPHeaders(request, true);
    if (headerValidation instanceof Response) return headerValidation;

    const cartId = params.id;

    if (!cartId) {
        return json(
            {
                status: "error",
                messages: [{
                    type: "error",
                    code: "missing_id",
                    content: "Cart ID is required",
                    severity: "recoverable",
                }],
            },
            { status: 400 }
        );
    }

    const cartService = new CartService(admin);

    try {
        const method = request.method.toUpperCase();

        if (method === "PUT") {
            // PUT /carts/:id - Update cart
            const rawBody = await request.json();
            const parsedBody = parseUCPLineItems(rawBody);
            const ucpRequest: UCPCartUpdateRequest = {
                ...parsedBody,
                id: cartId,
            };

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

            const cart = await cartService.updateCart(ucpRequest);
            const ucpResponse = formatUCPCartResponse(cart);

            return json(ucpResponse);
        }

        if (method === "DELETE") {
            // DELETE /carts/:id - Delete cart
            const deleted = await cartService.deleteCart(cartId);

            if (!deleted) {
                return json(
                    {
                        status: "error",
                        messages: [{
                            type: "error",
                            code: "not_found",
                            content: "Cart not found or could not be deleted",
                            severity: "recoverable",
                        }],
                    },
                    { status: 404 }
                );
            }

            return json({
                ucp: {
                    version: "2026-01-01",
                },
                deleted: true,
                id: cartId,
            });
        }

        return json(
            {
                status: "error",
                messages: [{
                    type: "error",
                    code: "method_not_allowed",
                    content: "Method not allowed. Use GET, PUT, or DELETE.",
                    severity: "recoverable",
                }],
            },
            { status: 405 }
        );
    } catch (error) {
        console.error("UCP Cart API error:", error);
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
