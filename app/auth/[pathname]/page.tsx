import { authViewPaths } from "@daveyplate/better-auth-ui"
import { AuthView } from "./view"

export function generateStaticParams() {
    return Object.values(authViewPaths).map((pathname) => ({ pathname }))
}

export default async function AuthPage({ params }: { params: Promise<{ pathname: string }> }) {
    const { pathname } = await params

    return (<div className="self-center min-w-3/4">
        <AuthView pathname={pathname} />
    </div>)
}