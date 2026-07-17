import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteShell } from "@/components/SiteShell";

const productKeys = ["viewer", "docs", "flow", "media"] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "products" });
  const meta = await getTranslations({ locale, namespace: "meta" });
  return {
    title: `${t("title")} — Northline`,
    description: meta("description"),
  };
}

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("products");

  return (
    <SiteShell>
      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">{t("subtitle")}</p>

        <ul className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2">
          {productKeys.map((key) => (
            <li key={key} className="border-t border-line pt-6">
              <h2 className="font-display text-xl font-semibold text-ink">
                {t(`items.${key}.name`)}
              </h2>
              <p className="mt-3 leading-relaxed text-ink-soft">
                {t(`items.${key}.desc`)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </SiteShell>
  );
}
