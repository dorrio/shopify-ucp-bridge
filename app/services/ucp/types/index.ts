/**
 * UCP Types for Shopify Bridge
 * Based on Universal Commerce Protocol JSON Schemas
 * https://ucp.dev/schemas/
 */

// ===== UCP Core Metadata =====

export interface UCPVersion {
    version: string; // YYYY-MM-DD format
}

export interface UCPMetadata extends UCPVersion {
    services?: Record<string, UCPService[]>;
    capabilities?: Record<string, UCPCapability[]>;
    payment_handlers?: Record<string, UCPPaymentHandler[]>;
}

export interface UCPService extends UCPVersion {
    spec?: string;
    schema?: string;
    id?: string;
    config?: Record<string, unknown>;
}

export interface UCPCapability extends UCPVersion {
    spec?: string;
    schema?: string;
    id?: string;
    config?: Record<string, unknown>;
}

export interface UCPPaymentHandler extends UCPVersion {
    spec?: string;
    schema?: string;
    id?: string;
    config?: Record<string, unknown>;
}

// ===== Line Items =====

export interface UCPLineItem {
    product_id: string;
    variant_id?: string;
    quantity: number;
    price?: UCPMoney;
    title?: string;
    image_url?: string;
    sku?: string;
    properties?: Record<string, string>;
}

export interface UCPOrderLineItem extends UCPLineItem {
    id: string;
    fulfilled_quantity?: number;
    fulfillable_quantity?: number;
}

// ===== Money & Totals =====

/**
 * Internal money format (Shopify-compatible)
 * Used for service layer operations
 */
export interface UCPMoney {
    amount: string;  // Decimal string e.g. "25.00"
    currency_code: string;
}

/**
 * External UCP money format (minor units)
 * Used for API responses to UCP consumers
 */
export interface UCPMoneyMinorUnits {
    amount: number;  // Integer minor units e.g. 2500 = $25.00
    currency_code: string;
}

export interface UCPTotal {
    type: 'subtotal' | 'tax' | 'shipping' | 'discount' | 'total' | 'due';
    amount: UCPMoney;
    label?: string;
}

// ===== Buyer =====

export interface UCPBuyer {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    addresses?: UCPAddress[];
}

export interface UCPAddress {
    id?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    province_code?: string;
    country?: string;
    country_code?: string;
    zip?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    company?: string;
}

// ===== Context =====

export interface UCPContext {
    country?: string;
    region?: string;
    postal_code?: string;
    language?: string;
    currency?: string;
}

// ===== Cart (dev.ucp.shopping.cart) =====

export interface UCPCart {
    ucp: UCPMetadata;
    id: string;
    line_items: UCPLineItem[];
    currency: string;
    totals: UCPTotal[];
    context?: UCPContext;
    buyer?: UCPBuyer;
    messages?: UCPMessage[];
    links?: UCPLink[];
    continue_url?: string;
    expires_at?: string;
}

export interface UCPCartCreateRequest {
    line_items: UCPLineItem[];
    context?: UCPContext;
    buyer?: UCPBuyer;
}

export interface UCPCartUpdateRequest {
    id: string;
    line_items: UCPLineItem[];
    context?: UCPContext;
    buyer?: UCPBuyer;
}

// ===== Checkout (dev.ucp.shopping.checkout) =====

export type UCPCheckoutStatus =
    | 'incomplete'
    | 'requires_escalation'
    | 'ready_for_complete'
    | 'complete_in_progress'
    | 'completed'
    | 'canceled';

export interface UCPCheckout {
    ucp: UCPMetadata;
    id: string;
    line_items: UCPLineItem[];
    status: UCPCheckoutStatus;
    currency: string;
    totals: UCPTotal[];
    links: UCPLink[];
    buyer?: UCPBuyer;
    context?: UCPContext;
    messages?: UCPMessage[];
    expires_at?: string;
    continue_url?: string;
    payment?: UCPPayment;
    order?: UCPOrderConfirmation;
    fulfillment?: UCPFulfillment;
    discount?: UCPDiscount;
}

export interface UCPCheckoutCreateRequest {
    line_items: UCPLineItem[];
    buyer?: UCPBuyer;
    context?: UCPContext;
    payment?: UCPPayment;
    cart_id?: string; // For cart-to-checkout conversion
    fulfillment?: UCPFulfillmentRequest;
}

export interface UCPCheckoutUpdateRequest {
    id: string;
    line_items: UCPLineItem[];
    buyer?: UCPBuyer;
    context?: UCPContext;
    payment?: UCPPayment;
    fulfillment?: UCPFulfillmentRequest;
}

export interface UCPCheckoutCompleteRequest {
    payment: UCPPayment;
}

// ===== Order (dev.ucp.shopping.order) =====

export interface UCPOrder {
    ucp: UCPMetadata;
    id: string;
    checkout_id: string;
    permalink_url: string;
    line_items: UCPOrderLineItem[];
    fulfillment: {
        expectations?: UCPExpectation[];
        events?: UCPFulfillmentEvent[];
    };
    adjustments?: UCPAdjustment[];
    totals: UCPTotal[];
}

export interface UCPOrderConfirmation {
    id: string;
    number?: string;
    permalink_url?: string;
}

export interface UCPExpectation {
    id: string;
    line_item_ids: string[];
    method: string;
    estimated_delivery?: string;
    destination?: UCPAddress;
}

export interface UCPFulfillmentEvent {
    id: string;
    line_item_ids: string[];
    status: 'pending' | 'in_transit' | 'delivered' | 'failed';
    tracking_number?: string;
    tracking_url?: string;
    carrier?: string;
    created_at: string;
}

export interface UCPAdjustment {
    id: string;
    type: 'refund' | 'return' | 'credit' | 'dispute' | 'cancellation';
    amount: UCPMoney;
    reason?: string;
    created_at: string;
}

// ===== Payment =====

export interface UCPPayment {
    method?: string;
    token?: string;
    billing_address?: UCPAddress;
}

// ===== Fulfillment Extension =====

export interface UCPFulfillment {
    destinations?: UCPAddress[];
    selected_destination_id?: string;
    groups?: UCPFulfillmentGroup[];
    available_methods?: UCPFulfillmentMethod[];
    selected_method_id?: string;
}

export interface UCPFulfillmentRequest {
    destination?: UCPAddress;
    selected_destination_id?: string;
    selected_method_id?: string;
}

export interface UCPFulfillmentGroup {
    id: string;
    line_item_ids: string[];
    available_methods: UCPFulfillmentMethod[];
    selected_method_id?: string;
}

export interface UCPFulfillmentMethod {
    id: string;
    type: 'shipping' | 'pickup' | 'digital';
    label: string;
    price: UCPMoney;
    estimated_delivery?: string;
    carrier?: string;
}

// ===== Discount Extension =====

export interface UCPDiscount {
    code?: string;
    type?: 'percentage' | 'fixed_amount' | 'free_shipping';
    value?: string;
    description?: string;
    applied_line_items?: string[];
}

// ===== Messages & Links =====

export type UCPMessageSeverity =
    | 'recoverable'
    | 'requires_buyer_input'
    | 'requires_buyer_review';

export interface UCPMessage {
    type: 'error' | 'warning' | 'info';
    code?: string;
    content: string;        // UCP standard field
    message?: string;       // Alias for backward compatibility
    severity?: UCPMessageSeverity;
    field?: string;
}

export interface UCPLink {
    rel: string;
    href: string;
    title?: string;
}
