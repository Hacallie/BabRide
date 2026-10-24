// Dark, full-width shell shared by sign-in, auth callback and rider onboarding. Same background as the homepage hero.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="hero-bg on-dark min-h-[calc(100vh-3.5rem)] px-4 py-8 text-white sm:py-12">
      <div className="mx-auto max-w-6xl">{children}</div>
    </div>
  );
}
