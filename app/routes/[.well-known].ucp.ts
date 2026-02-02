import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

/**
 * UCP Profile Discovery - Well-Known Endpoint
 * https://ucp.dev/latest/specification/overview/#profile-structure
 * 
 * GET /.well-known/ucp - Redirects to /ucp-profile
 * 
 * Per UCP specification, businesses publish their profile at /.well-known/ucp.
 * This route provides the standard well-known path and redirects to our profile endpoint.
 */

export async function loader({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    // Permanent redirect to the main profile endpoint
    return redirect(`${baseUrl}/ucp-profile`, 301);
}
