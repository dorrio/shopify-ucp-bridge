import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import shopify from "../shopify.server";
import prisma from "../db.server";

/**
 * Custom authentication strategy for UCP endpoints.
 * It tries:
 * 1. Standard Shopify Admin Authentication (for embedded app usage)
 * 2. Fallback: Loading the first available Offline Session from the DB (for external API usage)
 */
export async function authenticateUCP(request: Request) {
    try {
        // 1. Try standard auth (throws if fails)
        return await shopify.authenticate.admin(request);
    } catch (error) {
        // If it was a redirect (302) or 401, we suppress it and try offline fallback
        if (error instanceof Response && (error.status === 302 || error.status === 401 || error.status === 410)) {
            // 2. Fallback: Lookup offline session
            const sessionData = await prisma.session.findFirst({
                where: { isOnline: false },
            });

            if (!sessionData) {
                // If no session exists at all, re-throw the original auth error (redirect to login)
                // because it means the app is not installed anywhere.
                throw error;
            }

            // Load the full session object using the storage strategy
            // sessionData.id should be "offline_{shop}"
            const session = await shopify.sessionStorage.loadSession(sessionData.id);

            if (!session) {
                throw error;
            }

            // Construct an Admin Rest & Graphql client similar to what authenticate.admin returns
            // 3. Use unauthenticated admin context (designed for background jobs / external access)
            const { admin } = await shopify.unauthenticated.admin(session.shop);

            if (!admin) {
                throw new Error("Could not create admin context from offline session");
            }

            return {
                admin,
                session,
            };
        }

        // If it was another error, re-throw
        throw error;
    }
}
