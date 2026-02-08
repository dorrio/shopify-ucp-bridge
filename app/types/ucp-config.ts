
export interface UCPConfig {
    $schema?: string;
    ucp_version: string;
    roles: string[];
    runtime: string;
    identity: {
        name: string;
        description: string;
    };
    capabilities: Record<string, {
        versions: string[];
        enabled: boolean;
    }>;
    transports: {
        http?: {
            enabled: boolean;
            base_path: string;
        };
        mcp?: {
            enabled: boolean;
            stdio: boolean;
        };
        a2a?: {
            enabled: boolean;
        };
    };
    features: {
        currencies: string[];
        payment_methods: string[];
        fulfillment_types: string[];
    };
}
