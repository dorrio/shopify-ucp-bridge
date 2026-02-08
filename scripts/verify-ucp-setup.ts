
import { loader } from "../app/routes/ucp-profile";
import { json } from "@remix-run/node";

async function verify() {
    console.log("Verifying UCP Profile...");

    // Mock request
    const request = new Request("http://localhost:3000/ucp-profile");

    try {
        const response = await loader({ request, params: {}, context: {} });

        if (response instanceof Response) {
            const data = await response.json();
            console.log("Profile Data:", JSON.stringify(data, null, 2));

            if (data.name === "Shopify UCP Bridge" && data.version === "2026-01-01") {
                console.log("✅ Profile name and version match config.");
            } else {
                console.error("❌ Profile name or version mismatch.");
                process.exit(1);
            }

            // Verify REST endpoint has base path if configured
            const restService = data.services["dev.ucp.shopping"].find((s: any) => s.transport === "rest");
            if (restService) {
                if (restService.endpoint.includes("/api/ucp")) {
                    console.log("✅ REST endpoint correctly includes base path.");
                } else {
                    console.error(`❌ REST endpoint missing base path: ${restService.endpoint}`);
                    process.exit(1);
                }
            }

        } else {
            console.error("❌ Loader did not return a Response.");
            process.exit(1);
        }
    } catch (error) {
        console.error("❌ Error running loader:", error);
        process.exit(1);
    }
}

verify();
