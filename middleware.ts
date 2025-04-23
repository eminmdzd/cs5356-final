import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function middleware(request: NextRequest) {
    const session = await auth.api.getSession({
        headers: await headers()
    });

    if (request.url.endsWith("/auth/sign-in")) {
        if (session) {
            return NextResponse.redirect(new URL("/dashboard", request.url))
        } else {
            return NextResponse.next()
        }
    }

    if (!session) {
        return NextResponse.redirect(new URL("/auth/sign-in", request.url));
    }

    return NextResponse.next()
}

export const config = {
    runtime: "nodejs",
    matcher: ["/dashboard", "/audiobooks", "/upload", "/auth/sign-in"]
}