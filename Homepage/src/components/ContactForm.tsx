"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";

export function ContactForm() {
  const t = useTranslations("contact");
  const [sent, setSent] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(true);
  }

  if (sent) {
    return (
      <p className="rounded-md border border-teal/30 bg-teal/5 px-5 py-6 text-ink-soft">
        {t("sent")}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-5">
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium text-ink">{t("name")}</span>
        <input
          name="name"
          required
          placeholder={t("placeholderName")}
          className="rounded-md border border-line bg-white px-3.5 py-2.5 text-ink outline-none transition focus:border-teal"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium text-ink">{t("email")}</span>
        <input
          type="email"
          name="email"
          required
          placeholder={t("placeholderEmail")}
          className="rounded-md border border-line bg-white px-3.5 py-2.5 text-ink outline-none transition focus:border-teal"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium text-ink">{t("message")}</span>
        <textarea
          name="message"
          required
          rows={5}
          placeholder={t("placeholderMessage")}
          className="resize-y rounded-md border border-line bg-white px-3.5 py-2.5 text-ink outline-none transition focus:border-teal"
        />
      </label>
      <button
        type="submit"
        className="self-start rounded-md bg-teal px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-deep"
      >
        {t("submit")}
      </button>
    </form>
  );
}
