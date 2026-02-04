import type { EntryContext } from "@remix-run/node";
import { RemixServer } from "@remix-run/react";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { PassThrough } from "stream";
import { addDocumentResponseHeaders } from "./shopify.server";

export default function handleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    remixContext: EntryContext
) {
    addDocumentResponseHeaders(request, responseHeaders);

    return new Promise((resolve, reject) => {
        let shellRendered = false;
        const { pipe, abort } = renderToPipeableStream(
            <RemixServer context={remixContext} url={request.url} />,
            {
                onShellReady() {
                    shellRendered = true;
                    const body = new PassThrough();
                    const stream = createReadableStreamFromReadable(body);

                    responseHeaders.set("Content-Type", "text/html");

                    resolve(
                        new Response(stream, {
                            headers: responseHeaders,
                            status: responseStatusCode,
                        })
                    );

                    pipe(body);
                },
                onShellError(error: unknown) {
                    reject(error);
                },
                onError(error: unknown) {
                    responseStatusCode = 500;
                    // Log streaming rendering errors from inside the shell
                    if (shellRendered) {
                        console.error(error);
                    }
                },
            }
        );

        setTimeout(abort, 5000);
    });
}

function createReadableStreamFromReadable(readable: import("stream").Readable) {
    // This function adapts a Node.js Readable stream to a Web Standard ReadableStream
    // which Remix/Response expects.
    // In newer Node versions (v18+), Readable.toWeb() exists but let's implement a simple adapter to be safe/explicit.
    return new ReadableStream({
        start(controller) {
            readable.on("data", (chunk) => {
                controller.enqueue(chunk);
            });
            readable.on("end", () => {
                controller.close();
            });
            readable.on("error", (err) => {
                controller.error(err);
            });
        },
        cancel() {
            readable.destroy();
        },
    });
}
