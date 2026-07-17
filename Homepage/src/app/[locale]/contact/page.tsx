import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContactForm } from "@/components/ContactForm";
import { SiteShell } from "@/components/SiteShell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return {
    title: `${t("title")} — Northline`,
    description: t("subtitle"),
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contact");

  return (
    <SiteShell>
      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-4 max-w-xl text-lg text-ink-soft">{t("subtitle")}</p>
        <div className="mt-12">
          <ContactForm />
        </div>
      </section>
    </SiteShell>
  );
}
