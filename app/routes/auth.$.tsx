import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    console.log("Auth callback received:", request.url);
    try {
        const { session } = await authenticate.admin(request);
        console.log("Auth callback success. Session:", JSON.stringify(session, null, 2));
    } catch (error) {
        console.error("Auth callback error:", error);
        throw error;
    }
    return null;
};
