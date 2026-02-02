import { validateUCPMeta, isValidUUID } from "../app/utils/ucpMiddleware.js";

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

function testUUIDValidation() {
    console.log("Testing UUID validation...");

    const validUUID = "550e8400-e29b-41d4-a716-446655440000";
    const invalidUUID = "not-a-uuid";

    assert(isValidUUID(validUUID), "Valid UUID should pass");
    assert(!isValidUUID(invalidUUID), "Invalid UUID should fail");

    console.log("✅ UUID validation passed");
}

function testMetaValidation() {
    console.log("Testing Meta validation...");

    const validMeta = {
        meta: {
            "idempotency-key": "550e8400-e29b-41d4-a716-446655440000"
        }
    };

    const missingMeta = {};
    const missingKey = { meta: {} };
    const invalidKey = {
        meta: {
            "idempotency-key": "bad-key"
        }
    };

    // Test requirement
    const res1 = validateUCPMeta(validMeta, true);
    assert((res1 as any).valid === true, "Valid meta should pass");

    const res2 = validateUCPMeta(missingMeta, true);
    assert(res2 instanceof Response, "Missing meta should return Response error");

    const res3 = validateUCPMeta(missingKey, true);
    assert(res3 instanceof Response, "Missing key should return Response error");

    const res4 = validateUCPMeta(invalidKey, true);
    assert(res4 instanceof Response, "Invalid key format should return Response error");

    console.log("✅ Meta validation passed");
}

try {
    testUUIDValidation();
    testMetaValidation();
    console.log("🎉 All tests passed!");
} catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
}
