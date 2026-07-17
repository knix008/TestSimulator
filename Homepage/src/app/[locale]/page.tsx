import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Hero } from "@/components/Hero";
import { SiteShell } from "@/components/SiteShell";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <SiteShell>
      <Hero />
      <section className="relative overflow-hidden border-t border-line bg-mist">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 top-0 h-64 w-64 rounded-full bg-teal/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">
          <h2 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
            {t("focusTitle")}
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">
            {t("focusBody")}
          </p>
          <Link
            href="/products"
            className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-teal-deep underline-offset-4 transition hover:underline"
          >
            {t("focusLink")}
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
