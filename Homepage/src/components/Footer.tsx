import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function Footer() {
  const t = useTranslations("footer");
  const nav = useTranslations("nav");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-mist">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 md:flex-row md:items-end md:justify-between md:px-8">
        <div>
          <p className="font-display text-xl font-bold tracking-tight text-ink">
            Northline
          </p>
          <p className="mt-2 max-w-sm text-sm text-ink-soft">{t("tagline")}</p>
        </div>
        <div className="flex flex-wrap gap-5 text-sm text-ink-soft">
          <Link href="/products" className="hover:text-ink">
            {nav("products")}
          </Link>
          <Link href="/about" className="hover:text-ink">
            {nav("about")}
          </Link>
          <Link href="/contact" className="hover:text-ink">
            {nav("contact")}
          </Link>
        </div>
        <p className="text-sm text-ink-soft">{t("rights", { year })}</p>
      </div>
    </footer>
  );
}
