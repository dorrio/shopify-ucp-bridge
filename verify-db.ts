
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Connecting to database...');
    try {
        await prisma.$connect();
        console.log('Connected successfully.');

        // Check if we can query the Session table
        console.log('Attempting to query "Session" table...');
        const sessionCount = await prisma.session.count();
        console.log(`Found ${sessionCount} sessions in "Session" table.`);

        // Check strictly for table existence using raw SQL
        // This helps debug case sensitivity issues
        console.log('Checking information_schema for table "Session"...');
        const resultDetails = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name = 'Session' OR table_name = 'session');
    `;
        console.log('Tables found in information_schema matching Session/session:', resultDetails);

    } catch (e) {
        console.error('Error connecting or querying:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
