import "@shopify/shopify-app-remix/server/adapters/node";
import {
    ApiVersion,
    shopifyApp,
    DeliveryMethod,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
    apiKey: process.env.SHOPIFY_API_KEY!,
    apiSecretKey: process.env.SHOPIFY_API_SECRET!,
    appUrl: process.env.SHOPIFY_APP_URL || "https://example.com",
    scopes: process.env.SCOPES?.split(",") ?? [
        "write_draft_orders",
        "read_draft_orders",
        "read_fulfillments",
        "write_fulfillments",
        "read_inventory",
        "read_orders",
        "write_orders",
        "read_products",
        "write_products",
        "read_customers",
        "write_customers"
    ],
    apiVersion: ApiVersion.January26, // 2026-01 LTS
    isEmbeddedApp: true,
    sessionStorage: new PrismaSessionStorage(prisma),
    webhooks: {
        // UCP Order webhooks
        ORDERS_CREATE: {
            deliveryMethod: DeliveryMethod.Http,
            callbackUrl: "/webhooks/orders/create",
        },
        ORDERS_UPDATED: {
            deliveryMethod: DeliveryMethod.Http,
            callbackUrl: "/webhooks/orders/updated",
        },
        ORDERS_FULFILLED: {
            deliveryMethod: DeliveryMethod.Http,
            callbackUrl: "/webhooks/orders/fulfilled",
        },
        DRAFT_ORDERS_CREATE: {
            deliveryMethod: DeliveryMethod.Http,
            callbackUrl: "/webhooks/draft-orders/create",
        },
        DRAFT_ORDERS_UPDATE: {
            deliveryMethod: DeliveryMethod.Http,
            callbackUrl: "/webhooks/draft-orders/update",
        },
    },
    hooks: {
        afterAuth: async ({ session }) => {
            // Register webhooks after successful authentication
            await shopify.registerWebhooks({ session });
        },
    },
    future: {
        unstable_newEmbeddedAuthStrategy: true,
    },
});

export default shopify;
export const apiVersion = ApiVersion.January26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
