import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useLoaderData, useActionData, useNavigation } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
    TextField,
    Checkbox,
    Divider,
    Button,
    Banner,
    Box,
    Link,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
    await authenticate.admin(request);

    // Load current settings (would typically come from a database)
    return json({
        settings: {
            ucpServerUrl: "",
            webhookUrl: "",
            enableCart: true,
            enableCheckout: true,
            enableOrder: true,
            enableFulfillment: true,
        },
    });
}

export async function action({ request }: ActionFunctionArgs) {
    await authenticate.admin(request);

    const formData = await request.formData();

    const settings = {
        ucpServerUrl: formData.get("ucpServerUrl") as string,
        webhookUrl: formData.get("webhookUrl") as string,
        enableCart: formData.get("enableCart") === "on",
        enableCheckout: formData.get("enableCheckout") === "on",
        enableOrder: formData.get("enableOrder") === "on",
        enableFulfillment: formData.get("enableFulfillment") === "on",
    };

    // TODO: Save settings to database
    console.log("Settings saved:", settings);

    return json({ success: true, settings });
}

export default function Settings() {
    const { settings } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";

    const [ucpServerUrl, setUcpServerUrl] = useState(settings.ucpServerUrl);
    const [webhookUrl, setWebhookUrl] = useState(settings.webhookUrl);
    const [enableCart, setEnableCart] = useState(settings.enableCart);
    const [enableCheckout, setEnableCheckout] = useState(settings.enableCheckout);
    const [enableOrder, setEnableOrder] = useState(settings.enableOrder);
    const [enableFulfillment, setEnableFulfillment] = useState(settings.enableFulfillment);

    return (
        <Page
            title="UCP Bridge Settings"
            backAction={{ content: "Dashboard", url: "/app" }}
        >
            <Layout>
                <Layout.Section variant="oneHalf">
                    <Card>
                        <Form method="post">
                            <BlockStack gap="400">
                                <Text as="h2" variant="headingMd">Integration Settings</Text>

                                {actionData?.success && (
                                    <Banner tone="success">
                                        Settings saved successfully!
                                    </Banner>
                                )}

                                <TextField
                                    label="UCP Server URL"
                                    name="ucpServerUrl"
                                    type="url"
                                    helpText="External UCP server endpoint (optional)"
                                    value={ucpServerUrl}
                                    onChange={setUcpServerUrl}
                                    autoComplete="off"
                                />

                                <TextField
                                    label="Webhook URL"
                                    name="webhookUrl"
                                    type="url"
                                    helpText="URL for order lifecycle webhooks"
                                    value={webhookUrl}
                                    onChange={setWebhookUrl}
                                    autoComplete="off"
                                />

                                <Divider />

                                <Text as="h3" variant="headingMd">Capabilities</Text>
                                <Text as="p" tone="subdued">
                                    Enable or disable UCP capabilities
                                </Text>

                                <Checkbox
                                    name="enableCart"
                                    label="Cart Capability"
                                    helpText="dev.ucp.shopping.cart"
                                    checked={enableCart}
                                    onChange={setEnableCart}
                                />

                                <Checkbox
                                    name="enableCheckout"
                                    label="Checkout Capability"
                                    helpText="dev.ucp.shopping.checkout"
                                    checked={enableCheckout}
                                    onChange={setEnableCheckout}
                                />

                                <Checkbox
                                    name="enableOrder"
                                    label="Order Capability"
                                    helpText="dev.ucp.shopping.order"
                                    checked={enableOrder}
                                    onChange={setEnableOrder}
                                />

                                <Checkbox
                                    name="enableFulfillment"
                                    label="Fulfillment Extension"
                                    helpText="dev.ucp.shopping.fulfillment"
                                    checked={enableFulfillment}
                                    onChange={setEnableFulfillment}
                                />

                                <Divider />

                                <Button submit variant="primary" loading={isSubmitting}>
                                    Save Settings
                                </Button>
                            </BlockStack>
                        </Form>
                    </Card>
                </Layout.Section>

                <Layout.Section variant="oneHalf">
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">API Information</Text>

                            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                                <BlockStack gap="200">
                                    <Text as="p" fontWeight="bold">API Version</Text>
                                    <Text as="p">2026-01 (LTS)</Text>
                                </BlockStack>
                            </Box>

                            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                                <BlockStack gap="200">
                                    <Text as="p" fontWeight="bold">UCP Protocol Version</Text>
                                    <Text as="p">2026-01-01</Text>
                                </BlockStack>
                            </Box>

                            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                                <BlockStack gap="200">
                                    <Text as="p" fontWeight="bold">Supported Capabilities</Text>
                                    <Text as="p" variant="bodySm">• dev.ucp.shopping.cart</Text>
                                    <Text as="p" variant="bodySm">• dev.ucp.shopping.checkout</Text>
                                    <Text as="p" variant="bodySm">• dev.ucp.shopping.order</Text>
                                    <Text as="p" variant="bodySm">• dev.ucp.shopping.fulfillment</Text>
                                </BlockStack>
                            </Box>

                            <Divider />

                            <Text as="h3" variant="headingMd">Documentation</Text>
                            <BlockStack gap="200">
                                <Link url="https://ucp.dev/specification/overview" target="_blank">
                                    UCP Specification
                                </Link>
                                <Link url="https://ucp.dev/specification/checkout" target="_blank">
                                    Checkout Capability
                                </Link>
                                <Link url="https://ucp.dev/specification/cart" target="_blank">
                                    Cart Capability
                                </Link>
                            </BlockStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
