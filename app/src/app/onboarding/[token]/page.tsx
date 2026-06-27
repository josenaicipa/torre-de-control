import { OnboardingView } from "../onboarding-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function OnboardingPage({ params }: PageProps) {
  const { token } = await params;
  return <OnboardingView token={token} />;
}
