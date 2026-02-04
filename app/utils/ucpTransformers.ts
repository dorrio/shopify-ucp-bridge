/**
 * UCP Transformers - Bidirectional conversion between UCP and Shopify formats
 * 
 * UCP Format:
 * - Amounts in minor units (2500 = $25.00)
 * - Nested item structure in line_items
 * 
 * Shopify Format:
 * - Amounts as decimal strings ("25.00")
 * - Flat line_item structure
 */

import type {
    UCPCheckout,
    UCPLineItem,
    UCPTotal,
    UCPMoney,
} from "../services/ucp";

// Currency decimal places (most currencies have 2 decimals)
const CURRENCY_DECIMALS: Record<string, number> = {
    BHD: 3, // Bahraini dinar
    BIF: 0, // Burundian franc
    CLF: 4, // Chilean UF
    CLP: 0, // Chilean peso
    DJF: 0, // Djiboutian franc
    GNF: 0, // Guinean franc
    IQD: 3, // Iraqi dinar
    ISK: 0, // Icelandic króna
    JOD: 3, // Jordanian dinar
    JPY: 0, // Japanese yen
    KMF: 0, // Comorian franc
    KRW: 0, // South Korean won
    KWD: 3, // Kuwaiti dinar
    LYD: 3, // Libyan dinar
    OMR: 3, // Omani rial
    PYG: 0, // Paraguayan guaraní
    RWF: 0, // Rwandan franc
    TND: 3, // Tunisian dinar
    UGX: 0, // Ugandan shilling
    VND: 0, // Vietnamese đồng
    VUV: 0, // Vanuatu vatu
    XAF: 0, // Central African CFA franc
    XOF: 0, // West African CFA franc
    XPF: 0, // CFP franc
};

/**
 * Get decimal places for a currency code
 */
function getCurrencyDecimals(currencyCode: string): number {
    return CURRENCY_DECIMALS[currencyCode.toUpperCase()] ?? 2;
}

/**
 * Convert decimal string to minor units (cents)
 * "25.00" → 2500
 */
export function toMinorUnits(amount: string, currencyCode: string): number {
    const decimals = getCurrencyDecimals(currencyCode);
    const numericAmount = parseFloat(amount);

    if (isNaN(numericAmount)) {
        return 0;
    }

    return Math.round(numericAmount * Math.pow(10, decimals));
}

/**
 * Convert minor units (cents) to decimal string
 * 2500 → "25.00"
 */
export function fromMinorUnits(cents: number, currencyCode: string): string {
    const decimals = getCurrencyDecimals(currencyCode);
    const amount = cents / Math.pow(10, decimals);
    return amount.toFixed(decimals);
}

/**
 * Transform UCPMoney from Shopify format to UCP format
 */
export function transformMoneyToUCP(money: UCPMoney): number {
    return toMinorUnits(money.amount, money.currency_code);
}

/**
 * Transform amount from UCP format to Shopify format
 */
export function transformMoneyFromUCP(cents: number, currencyCode: string): UCPMoney {
    return {
        amount: fromMinorUnits(cents, currencyCode),
        currency_code: currencyCode,
    };
}

/**
 * Parse incoming UCP request line_items
 * Handles both UCP format (nested item) and legacy format (flat)
 */
export function parseUCPLineItems(body: any): any {
    if (!body.line_items || !Array.isArray(body.line_items)) {
        return body;
    }

    const transformedLineItems = body.line_items.map((lineItem: any) => {
        // UCP format: { item: { id, title, price }, quantity, id }
        if (lineItem.item) {
            const item = lineItem.item;
            const currency = body.currency || "USD";

            return {
                product_id: item.id || "",
                variant_id: item.variant_id || item.id || "",
                quantity: lineItem.quantity || 1,
                title: item.title,
                sku: item.sku,
                image_url: item.image_url,
                // Convert minor units to decimal string for Shopify
                price: typeof item.price === "number"
                    ? transformMoneyFromUCP(item.price, currency)
                    : item.price,
            } as UCPLineItem;
        }

        // Already in internal/legacy format
        // FIX: Ensure variant_id is populated if product_id is a variant GID
        if (lineItem.product_id && !lineItem.variant_id && lineItem.product_id.includes("ProductVariant")) {
            return {
                ...lineItem,
                variant_id: lineItem.product_id,
            };
        }

        return lineItem;
    });

    return {
        ...body,
        line_items: transformedLineItems,
    };
}

/**
 * Transform line item to UCP response format
 */
function transformLineItemToUCP(lineItem: UCPLineItem, currency: string): any {
    const price = lineItem.price
        ? toMinorUnits(lineItem.price.amount, lineItem.price.currency_code)
        : 0;

    return {
        id: lineItem.variant_id || lineItem.product_id,
        item: {
            id: lineItem.product_id,
            variant_id: lineItem.variant_id,
            title: lineItem.title,
            sku: lineItem.sku,
            image_url: lineItem.image_url,
            price,
        },
        quantity: lineItem.quantity,
        totals: price > 0 ? [{
            type: "line_total",
            amount: price * lineItem.quantity,
        }] : undefined,
    };
}

/**
 * Transform totals to UCP response format
 */
function transformTotalsToUCP(totals: UCPTotal[]): any[] {
    return totals.map(total => ({
        type: total.type,
        amount: toMinorUnits(total.amount.amount, total.amount.currency_code),
        label: total.label,
    }));
}

/**
 * Format checkout response for UCP consumers
 * Converts all amounts to minor units
 */
export function formatUCPCheckoutResponse(checkout: UCPCheckout): any {
    const currency = checkout.currency || "USD";

    // Calculate expires_at if not set (24h TTL)
    const expiresAt = checkout.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return {
        ucp: checkout.ucp,
        id: checkout.id,
        status: checkout.status,
        currency,
        expires_at: expiresAt,
        line_items: checkout.line_items.map(item => transformLineItemToUCP(item, currency)),
        totals: transformTotalsToUCP(checkout.totals),
        buyer: checkout.buyer,
        messages: checkout.messages?.map(msg => ({
            type: msg.type,
            code: msg.code,
            content: msg.content,  // Use content directly (already in correct format)
            severity: msg.severity,
            field: msg.field,
        })),
        links: checkout.links,
        continue_url: checkout.continue_url,
        payment: checkout.payment,
        order: checkout.order,
        fulfillment: checkout.fulfillment,
    };
}

/**
 * Format cart response for UCP consumers
 */
export function formatUCPCartResponse(cart: any): any {
    const currency = cart.currency || "USD";

    return {
        ucp: cart.ucp,
        id: cart.id,
        currency,
        line_items: cart.line_items.map((item: UCPLineItem) => transformLineItemToUCP(item, currency)),
        totals: transformTotalsToUCP(cart.totals),
        buyer: cart.buyer,
        continue_url: cart.continue_url,
    };
}

/**
 * Format order response for UCP consumers
 */
export function formatUCPOrderResponse(order: any): any {
    const currency = order.currency || order.totals?.[0]?.amount?.currency_code || "USD";

    return {
        ucp: order.ucp,
        id: order.id,
        checkout_id: order.checkout_id,
        permalink_url: order.permalink_url,
        line_items: order.line_items.map((item: UCPLineItem) => ({
            ...transformLineItemToUCP(item, currency),
            fulfilled_quantity: (item as any).fulfilled_quantity,
            fulfillable_quantity: (item as any).fulfillable_quantity,
        })),
        fulfillment: order.fulfillment,
        adjustments: order.adjustments?.map((adj: any) => ({
            ...adj,
            amount: toMinorUnits(adj.amount.amount, adj.amount.currency_code),
        })),
        totals: transformTotalsToUCP(order.totals),
    };
}
