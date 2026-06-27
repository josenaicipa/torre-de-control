import { OnboardingView } from "../onboarding/onboarding-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function FormularioOnboardingPage({
  searchParams,
}: PageProps) {
  const { token } = await searchParams;
  const value = Array.isArray(token) ? token[0] : token;
  return <OnboardingView token={value} />;
}
