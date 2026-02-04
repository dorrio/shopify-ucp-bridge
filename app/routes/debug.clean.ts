import { json } from "@remix-run/node";
import prisma from "../db.server";

export async function loader() {
    try {
        await prisma.session.deleteMany({});
        return json({ status: "success", message: "All sessions deleted." });
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}
