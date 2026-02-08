
import { loader } from "../app/routes/ucp-profile";
import "@remix-run/node";
// @ts-ignore
import ucpConfig from "../ucp.config.json";

async function verify() {
    console.log("Verifying UCP Profile...");

    // Mock request
    const request = new Request("http://localhost:3000/ucp-profile");

    try {
        const response = await loader({ request, params: {}, context: {} });

        if (response instanceof Response) {
            const data = await response.json();
            console.log("Profile Data:", JSON.stringify(data, null, 2));

            // Use dynamic config values for verification
            const expectedName = ucpConfig.identity.name;
            const expectedVersion = ucpConfig.ucp_version;

            if (data.name === expectedName && data.version === expectedVersion) {
                console.log(`✅ Profile name (${expectedName}) and version (${expectedVersion}) match config.`);
            } else {
                console.error(`❌ Profile mismatch. Expected Name: ${expectedName}, Version: ${expectedVersion}. Got Name: ${data.name}, Version: ${data.version}`);
                process.exit(1);
            }

            // Verify REST endpoint has base path if configured
            if (!data.services || !Array.isArray(data.services["dev.ucp.shopping"])) {
                console.error("❌ Validation Failed: 'data.services[\"dev.ucp.shopping\"]' is missing or not an array.");
                process.exit(1);
            }

            const restService = data.services["dev.ucp.shopping"].find((s: any) => s.transport === "rest");
            if (restService) {
                const expectedBasePath = ucpConfig.transports.http.base_path;
                if (restService.endpoint.includes(expectedBasePath)) {
                    console.log(`✅ REST endpoint correctly includes base path: ${expectedBasePath}`);
                } else {
                    console.error(`❌ REST endpoint missing base path (${expectedBasePath}): ${restService.endpoint}`);
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

verify().catch(err => {
    console.error('verify failed', err);
    process.exit(1);
});
