import { Outlet, useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisTranslations from "@shopify/polaris/locales/en.json";

export async function loader({ request }: LoaderFunctionArgs) {
    await authenticate.admin(request);
    return json({ apiKey: process.env.SHOPIFY_API_KEY || "" });
}

export default function App() {
    const { apiKey } = useLoaderData<typeof loader>();
    return (
        <AppProvider isEmbeddedApp apiKey={apiKey} i18n={polarisTranslations}>
            <Outlet />
        </AppProvider>
    );
}
