import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteShell } from "@/components/SiteShell";

const valueKeys = ["craft", "speed", "reach"] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return {
    title: `${t("title")} — Northline`,
    description: t("subtitle"),
  };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");

  return (
    <SiteShell>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,color-mix(in_srgb,var(--teal)_12%,transparent),transparent_50%)]"
        />
        <div className="relative mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-2xl font-display text-2xl font-semibold leading-snug text-teal-deep md:text-3xl">
            {t("subtitle")}
          </p>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-ink-soft">
            {t("body")}
          </p>

          <h2 className="mt-16 font-display text-2xl font-bold text-ink">
            {t("valuesTitle")}
          </h2>
          <ul className="mt-8 grid gap-10 md:grid-cols-3">
            {valueKeys.map((key) => (
              <li key={key}>
                <h3 className="font-display text-lg font-semibold text-ink">
                  {t(`values.${key}.title`)}
                </h3>
                <p className="mt-2 leading-relaxed text-ink-soft">
                  {t(`values.${key}.desc`)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </SiteShell>
  );
}
