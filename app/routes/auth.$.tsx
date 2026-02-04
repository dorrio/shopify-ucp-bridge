import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    console.log("Auth callback received:", request.url);
    try {
        await authenticate.admin(request);
        return null;
    } catch (error) {
        // If it's a Redirect (Success), just throw it to let Remix handle it
        if (error instanceof Response) {
            console.log("Auth success! Redirecting to:", error.headers.get("Location"));
            throw error;
        }

        // Real Error: Log it and SHOW IT to the user
        console.error("Auth callback CRITICAL error:", error);

        return new Response(
            `<h1>Auth Failed</h1><p>${error instanceof Error ? error.message : String(error)}</p><pre>${JSON.stringify(error, null, 2)}</pre>`,
            {
                status: 500,
                headers: { "Content-Type": "text/html" }
            }
        );
    }
};
