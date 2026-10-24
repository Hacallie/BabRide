// Runs once when the Next.js server starts. Logs configuration problems by variable NAME only.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateEnv, formatEnvReport } = await import("@/lib/env");
  const report = validateEnv();
  if (!report.ok) console.error(formatEnvReport(report));
}
