import fetch from "node-fetch";

async function verifyEndpoints() {
    const urlArg = process.argv.find(arg => arg.startsWith("--url="));
    const baseUrl = urlArg ? urlArg.split("=")[1] : "http://localhost:3000"; // Default, though likely needs the shopify tunnel

    console.log(`Verifying endpoints at ${baseUrl}...\n`);

    // 1. Verify Public Profile
    try {
        console.log(`[GET] ${baseUrl}/ucp-profile`);
        const profileRes = await fetch(`${baseUrl}/ucp-profile`);
        console.log(`Status: ${profileRes.status}`);

        if (profileRes.status === 200) {
            const data = await profileRes.json() as any;
            console.log("✅ Success! Found UCP Profile:");
            console.log(`   Name: ${data.name}`);
            console.log(`   Services: ${Object.keys(data.services || {}).join(", ")}`);
        } else {
            console.log("❌ Failed to fetch profile");
            console.log(await profileRes.text());
        }
    } catch (err: any) {
        console.log(`❌ Error connecting: ${err.message}`);
    }

    console.log("\n-----------------------------------\n");

    // 2. Verify Checkout Session (Expected 401/302 for unauth)
    try {
        console.log(`[POST] ${baseUrl}/checkout-sessions`);
        const checkoutRes = await fetch(`${baseUrl}/checkout-sessions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                line_items: [
                    {
                        item: { id: "test", title: "Test Item", price: 1000 },
                        quantity: 1
                    }
                ]
            })
        });

        console.log(`Status: ${checkoutRes.status}`);

        if (checkoutRes.status === 200 || checkoutRes.status === 201) {
            console.log("⚠️  Unexpected success (Endpoint should be protected)");
        } else if (checkoutRes.status === 401 || checkoutRes.status === 302 || checkoutRes.status === 403) {
            console.log("✅ Expected behavior (Endpoint is protected)");
        } else {
            console.log("❓ Other status:", checkoutRes.status);
        }

    } catch (err: any) {
        console.log(`❌ Error connecting: ${err.message}`);
    }
}

verifyEndpoints();
