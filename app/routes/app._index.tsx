import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
    InlineStack,
    Badge,
    Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { CartService, OrderService } from "../services/ucp";

export async function loader({ request }: LoaderFunctionArgs) {
    const { admin, session } = await authenticate.admin(request);

    const cartService = new CartService(admin);
    const orderService = new OrderService(admin);

    try {
        const [cartCount, orderCount] = await Promise.all([
            cartService.getCartCount(),
            orderService.getOrderCount(),
        ]);

        return json({
            shop: session.shop,
            stats: {
                activeCarts: cartCount,
                recentOrders: orderCount,
            },
            services: {
                cart: { status: "active", version: "2026-01-01" },
                checkout: { status: "active", version: "2026-01-01" },
                order: { status: "active", version: "2026-01-01" },
                product: { status: "active", version: "2026-01-01" },
                fulfillment: { status: "active", version: "2026-01-01" },
                debug: {
                    scopes: session.scope,
                    token: session.accessToken ? "yes" : "no",
                    error: undefined as string | undefined
                }
            },
        });
    } catch (error) {
        console.error("Error loading dashboard data:", error);
        return json({
            shop: session.shop,
            stats: { activeCarts: 0, recentOrders: 0 },
            services: {
                cart: { status: "error", version: "2026-01-01" },
                checkout: { status: "error", version: "2026-01-01" },
                order: { status: "error", version: "2026-01-01" },
                product: { status: "error", version: "2026-01-01" },
                fulfillment: { status: "error", version: "2026-01-01" },
                debug: {
                    scopes: "Error",
                    token: "no",
                    error: error instanceof Error ? error.message : String(error)
                }
            },
        });
    }
}

export default function AppIndex() {
    const { shop, stats, services } = useLoaderData<typeof loader>();

    return (
        <Page
            title="UCP Bridge"
            primaryAction={{ content: "Settings", url: "/app/settings" }}
        >
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">
                                Debug Info (v2-debug)
                            </Text>
                            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                                <BlockStack gap="200">
                                    <Text as="p"><strong>Shop:</strong> {shop}</Text>
                                    <Text as="p"><strong>Scopes:</strong> {services.debug?.scopes || 'N/A'}</Text>
                                    <Text as="p"><strong>Token:</strong> {services.debug?.token === 'yes' ? 'Present (Masked)' : 'MISSING (or "no")'}</Text>
                                    {services.debug?.error && (
                                        <Text as="p" tone="critical"><strong>Error:</strong> {services.debug.error}</Text>
                                    )}
                                </BlockStack>
                            </Box>
                        </BlockStack>
                    </Card>
                </Layout.Section>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingLg">
                                Universal Commerce Protocol Bridge
                            </Text>
                            <Text as="p">
                                Connected to <Text as="span" fontWeight="bold">{shop}</Text>
                            </Text>
                            <Text as="p" tone="subdued">
                                UCP API Version: 2026-01 | Protocol Version: 2026-01-01
                            </Text>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                <Layout.Section variant="oneThird">
                    <Card>
                        <BlockStack gap="300">
                            <Text as="h3" variant="headingMd">Active Carts</Text>
                            <Text as="p" variant="headingXl">{stats.activeCarts}</Text>
                            <Text as="p" tone="subdued">Draft orders as UCP carts</Text>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                <Layout.Section variant="oneThird">
                    <Card>
                        <BlockStack gap="300">
                            <Text as="h3" variant="headingMd">Recent Orders</Text>
                            <Text as="p" variant="headingXl">{stats.recentOrders}</Text>
                            <Text as="p" tone="subdued">Completed UCP checkouts</Text>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">UCP Capabilities Status</Text>
                            <InlineStack gap="400" wrap>
                                <ServiceStatusCard
                                    name="Cart"
                                    capability="dev.ucp.shopping.cart"
                                    status={services.cart.status}
                                />
                                <ServiceStatusCard
                                    name="Checkout"
                                    capability="dev.ucp.shopping.checkout"
                                    status={services.checkout.status}
                                />
                                <ServiceStatusCard
                                    name="Order"
                                    capability="dev.ucp.shopping.order"
                                    status={services.order.status}
                                />
                                <ServiceStatusCard
                                    name="Product"
                                    capability="dev.ucp.shopping.product"
                                    status={services.product.status}
                                />
                                <ServiceStatusCard
                                    name="Fulfillment"
                                    capability="dev.ucp.shopping.fulfillment"
                                    status={services.fulfillment.status}
                                />
                            </InlineStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">API Endpoints</Text>
                            <Text as="p" tone="subdued">
                                UCP REST API endpoints available for integration:
                            </Text>
                            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                                <BlockStack gap="200">
                                    <Text as="p" fontWeight="bold">Cart API</Text>
                                    <Text as="p" variant="bodyMd">
                                        <code>POST/GET/PATCH/DELETE /api/ucp/cart</code>
                                    </Text>
                                </BlockStack>
                            </Box>
                            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                                <BlockStack gap="200">
                                    <Text as="p" fontWeight="bold">Checkout API</Text>
                                    <Text as="p" variant="bodyMd">
                                        <code>POST/GET/PATCH/DELETE /api/ucp/checkout</code>
                                    </Text>
                                </BlockStack>
                            </Box>
                            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                                <BlockStack gap="200">
                                    <Text as="p" fontWeight="bold">Order API</Text>
                                    <Text as="p" variant="bodyMd">
                                        <code>GET /api/ucp/order/:id</code>
                                    </Text>
                                </BlockStack>
                            </Box>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}

function ServiceStatusCard({
    name,
    capability,
    status
}: {
    name: string;
    capability: string;
    status: string;
}) {
    const badgeTone = status === "active" ? "success" : "critical";
    const statusLabel = status === "active" ? "Active" : "Error";

    return (
        <Card>
            <BlockStack gap="200">
                <InlineStack align="space-between">
                    <Text as="span" fontWeight="bold">{name}</Text>
                    <Badge tone={badgeTone}>{statusLabel}</Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">{capability}</Text>
            </BlockStack>
        </Card>
    );
}
