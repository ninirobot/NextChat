import { NextRequest } from "next/server";
import { getServerSideConfig } from "@/app/config/server";
import {
    NVIDIA_BASE_URL,
    ApiPath,
} from "@/app/constant";
import { auth } from "@/app/api/auth";
import { ModelProvider } from "@/app/constant";

const serverConfig = getServerSideConfig();

export async function handle(
    req: NextRequest,
    { params }: { params: { path: string[] } },
) {
    console.log("[Nvidia Route] params ", params);

    if (req.method === "OPTIONS") {
        return new Response(JSON.stringify({ body: "OK" }), { status: 200 });
    }

    const authResult = auth(req, ModelProvider.Nvidia);
    if (authResult.error) {
        return new Response(JSON.stringify(authResult), {
            status: 401,
        });
    }

    try {
        const response = await request(req);
        return response;
    } catch (e) {
        console.error("[Nvidia] ", e);
        return new Response(JSON.stringify({ error: String(e) }), {
            status: 500,
        });
    }
}

async function request(req: NextRequest) {
    const controller = new AbortController();

    let path = `${req.nextUrl.pathname}`.replaceAll(ApiPath.Nvidia, "");

    let baseUrl = serverConfig.nvidiaUrl || NVIDIA_BASE_URL;

    if (!baseUrl.startsWith("http")) {
        baseUrl = `https://${baseUrl}`;
    }

    if (baseUrl.endsWith("/")) {
        baseUrl = baseUrl.slice(0, -1);
    }

    console.log("[Proxy] ", path);
    console.log("[Base Url]", baseUrl);

    const timeoutId = setTimeout(
        () => {
            controller.abort();
        },
        10 * 60 * 1000,
    );

    const fetchUrl = `${baseUrl}${path}`;

    const fetchOptions: RequestInit = {
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            Authorization: req.headers.get("Authorization") ?? "",
        },
        method: req.method,
        body: req.body,
        redirect: "manual",
        // @ts-ignore
        duplex: "half",
        signal: controller.signal,
    };

    try {
        const res = await fetch(fetchUrl, fetchOptions);

        // to prevent browser prompt for credentials
        const newHeaders = new Headers(res.headers);
        newHeaders.delete("www-authenticate");
        // to disable nginx buffering
        newHeaders.set("X-Accel-Buffering", "no");

        return new Response(res.body, {
            status: res.status,
            statusText: res.statusText,
            headers: newHeaders,
        });
    } finally {
        clearTimeout(timeoutId);
    }
}
