import type { EntryContext } from "@remix-run/node";
import { RemixServer } from "@remix-run/react";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import { addDocumentResponseHeaders } from "./shopify.server";

export default async function handleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    remixContext: EntryContext
) {
    addDocumentResponseHeaders(request, responseHeaders);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const body = await renderToReadableStream(
        <RemixServer context={remixContext} url={request.url} />,
        {
            signal: controller.signal,
            onError(error: unknown) {
                if (!controller.signal.aborted) {
                    // Log streaming rendering errors from inside the shell
                    console.error(error);
                    responseStatusCode = 500;
                }
            },
        }
    );

    if (isbot(request.headers.get("user-agent") || "")) {
        await body.allReady;
    }

    responseHeaders.set("Content-Type", "text/html");

    return new Response(body, {
        headers: responseHeaders,
        status: responseStatusCode,
    });
}
