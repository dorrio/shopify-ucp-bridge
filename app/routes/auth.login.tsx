import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, Text, Button, TextField, BlockStack } from "@shopify/polaris";
import { useState, useCallback } from "react";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    if (url.searchParams.get("shop")) {
        throw await login(request);
    }
    return json({ showForm: Boolean(login) });
};

export const action = async ({ request }: LoaderFunctionArgs) => {
    const errors: Record<string, string> = {};
    if (login) {
        try {
            await login(request);
        } catch (error) {
            if (error instanceof Response) {
                return error;
            }
            errors.shop = error instanceof Error ? error.message : "Unknown error";
        }
    }
    return json({ errors });
};

export default function Auth() {
    const { showForm } = useLoaderData<typeof loader>();
    const [shop, setShop] = useState("");
    const handleChange = useCallback((newValue: string) => setShop(newValue), []);

    return (
        <Page>
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h1" variant="headingMd">
                                Log in
                            </Text>
                            <Text as="p">
                                Enter your shop domain to log in or install this app.
                            </Text>
                            {showForm && (
                                <Form method="post">
                                    <BlockStack gap="400">
                                        <TextField
                                            label="Shop domain"
                                            name="shop"
                                            value={shop}
                                            onChange={handleChange}
                                            autoComplete="organization"
                                            placeholder="my-shop.myshopify.com"
                                        />
                                        <Button submit variant="primary">
                                            Log in
                                        </Button>
                                    </BlockStack>
                                </Form>
                            )}
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
