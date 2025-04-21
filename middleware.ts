import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function middleware(request: NextRequest) {
    const session = await auth.api.getSession({
        headers: await headers()
    });

    if (!session) {
        return NextResponse.redirect(new URL("/auth/sign-in", request.url));
    }

    if (request.url.endsWith("/admin") && session.user.role !== "admin") {
        return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next()
}

export const config = {
    runtime: "nodejs",
    matcher: ["/dashboard", "/audiobooks", "/upload", "/admin"]
}