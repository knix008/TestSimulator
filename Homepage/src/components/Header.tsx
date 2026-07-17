"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LanguageSwitcher } from "./LanguageSwitcher";

const links = [
  { href: "/", key: "home" as const },
  { href: "/products", key: "products" as const },
  { href: "/about", key: "about" as const },
  { href: "/contact", key: "contact" as const },
];

export function Header() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const onHero = pathname === "/";

  return (
    <header
      className={
        onHero
          ? "absolute inset-x-0 top-0 z-40"
          : "sticky top-0 z-40 border-b border-line/70 bg-paper/90 backdrop-blur-md"
      }
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 md:px-8">
        <Link
          href="/"
          className={`font-display text-lg font-bold tracking-tight md:text-xl ${
            onHero ? "text-white" : "text-ink"
          }`}
          onClick={() => setOpen(false)}
        >
          Northline
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.key}
                href={link.href}
                className={`text-sm tracking-wide transition-colors ${
                  onHero
                    ? active
                      ? "text-white"
                      : "text-white/70 hover:text-white"
                    : active
                      ? "text-ink"
                      : "text-ink-soft hover:text-ink"
                }`}
              >
                {t(link.key)}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher />
          <Link
            href="/contact"
            className={`rounded-md px-3.5 py-2 text-sm font-semibold transition hover:brightness-110 ${
              onHero
                ? "bg-teal-glow text-hero-top"
                : "bg-teal text-white hover:bg-teal-deep"
            }`}
          >
            {t("cta")}
          </Link>
        </div>

        <button
          type="button"
          className={`inline-flex h-10 w-10 items-center justify-center rounded-md border md:hidden ${
            onHero
              ? "border-white/25 text-white"
              : "border-line text-ink"
          }`}
          aria-expanded={open}
          aria-label="Menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">Menu</span>
          <span className="flex w-4 flex-col gap-1.5">
            <span className="block h-0.5 bg-current" />
            <span className="block h-0.5 bg-current" />
            <span className="block h-0.5 bg-current" />
          </span>
        </button>
      </div>

      {open ? (
        <div
          className={`border-t px-5 py-4 md:hidden ${
            onHero
              ? "border-white/10 bg-hero-top/95 backdrop-blur-md"
              : "border-line bg-paper"
          }`}
        >
          <nav className="flex flex-col gap-3">
            {links.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className={`py-1 text-base ${
                  onHero ? "text-white/90" : "text-ink"
                }`}
                onClick={() => setOpen(false)}
              >
                {t(link.key)}
              </Link>
            ))}
            <div className="flex items-center justify-between gap-3 pt-2">
              <LanguageSwitcher />
              <Link
                href="/contact"
                className={`rounded-md px-3.5 py-2 text-sm font-semibold ${
                  onHero
                    ? "bg-teal-glow text-hero-top"
                    : "bg-teal text-white"
                }`}
                onClick={() => setOpen(false)}
              >
                {t("cta")}
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
