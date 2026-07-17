import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

export function SiteShell({
  children,
  tone = "light",
}: {
  children: React.ReactNode;
  tone?: "light" | "dark";
}) {
  return (
    <div className="flex min-h-full flex-col">
      <Header />
      <main className={`flex-1 ${tone === "light" ? "bg-paper" : ""}`}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
