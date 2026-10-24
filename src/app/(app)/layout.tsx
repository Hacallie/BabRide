// Each page's Gate draws the shared brand band and the content container.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[70vh]">{children}</div>;
}