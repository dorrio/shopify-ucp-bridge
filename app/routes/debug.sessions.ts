import { json } from "@remix-run/node";
import prisma from "../db.server";

export async function loader() {
    try {
        const sessions = await prisma.session.findMany({
            select: {
                id: true,
                shop: true,
                isOnline: true,
                scope: true,
                expires: true,
            }
        });

        return json({
            count: sessions.length,
            sessions
        });
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}
