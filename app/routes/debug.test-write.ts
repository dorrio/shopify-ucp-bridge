import { json } from "@remix-run/node";
import prisma from "../db.server";

export async function loader() {
    const testId = `test_${Date.now()}`;
    try {
        console.log("Attempting manual DB write...");
        // Attempt to create a dummy session
        const session = await prisma.session.create({
            data: {
                id: testId,
                shop: "test-shop.myshopify.com",
                state: "test-state",
                isOnline: false,
                accessToken: "test-token",
                scope: "read_products",
                expires: new Date(Date.now() + 86400000), // tomorow
            }
        });
        console.log("Write success:", session);
        return json({ status: "success", session });
    } catch (error) {
        console.error("Write failed:", error);
        return json({
            status: "error",
            message: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined
        }, { status: 500 });
    }
}
