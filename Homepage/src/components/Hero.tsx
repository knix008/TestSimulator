import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function Hero() {
  const t = useTranslations("hero");

  return (
    <section className="relative min-h-[100svh] overflow-hidden bg-hero-top text-white">
      <div
        aria-hidden
        className="hero-atmosphere pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 70% 40%, color-mix(in srgb, var(--hero-accent) 55%, transparent), transparent 60%),
            radial-gradient(ellipse 50% 45% at 20% 70%, color-mix(in srgb, var(--teal-glow) 28%, transparent), transparent 55%),
            linear-gradient(165deg, var(--hero-top) 0%, var(--hero-mid) 48%, #0d242c 100%)
          `,
        }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)
          `,
          backgroundSize: "72px 72px",
          maskImage:
            "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
        }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[42%] h-px overflow-hidden"
      >
        <div className="hero-shimmer h-full w-1/3 bg-gradient-to-r from-transparent via-teal-glow to-transparent" />
      </div>

      <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-end px-5 pb-16 pt-28 md:justify-center md:px-8 md:pb-24 md:pt-24">
        <p className="animate-rise font-display text-5xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl lg:text-8xl">
          {t("brand")}
        </p>
        <h1 className="animate-rise-delay-1 mt-6 max-w-2xl font-display text-2xl font-semibold leading-snug tracking-tight text-white/95 sm:text-3xl md:text-4xl">
          {t("headline")}
        </h1>
        <p className="animate-rise-delay-2 mt-4 max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
          {t("sub")}
        </p>
        <div className="animate-rise-delay-3 mt-9 flex flex-wrap gap-3">
          <Link
            href="/products"
            className="rounded-md bg-teal-glow px-5 py-3 text-sm font-semibold text-hero-top transition hover:brightness-110"
          >
            {t("primaryCta")}
          </Link>
          <Link
            href="/about"
            className="rounded-md border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/60 hover:bg-white/5"
          >
            {t("secondaryCta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
