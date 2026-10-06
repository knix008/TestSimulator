import { vi } from "vitest";

export function currentMonthDate(day: number, year = new Date().getFullYear(), month = new Date().getMonth()): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function installHolidayFetch() {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("AvailableCountries")) {
      return Response.json([
        { countryCode: "KR", name: "South Korea" },
        { countryCode: "US", name: "United States" },
        { countryCode: "JP", name: "Japan" },
        { countryCode: "KR", name: "South Korea" },
        { countryCode: "ZZ", name: "Zedland" },
      ]);
    }
    const match = url.match(/PublicHolidays\/(\d{4})\/([A-Z]{2})/);
    if (!match) return new Response("not found", { status: 404 });
    const year = Number(match[1]);
    const country = match[2];
    return Response.json([
      {
        date: currentMonthDate(5, year),
        localName: "개천절",
        name: "Foundation Day",
        countryCode: country,
        types: ["Public"],
      },
      {
        date: currentMonthDate(9, year),
        localName: "한글날",
        name: "Hangul Day",
        countryCode: country,
        types: ["Bank"],
      },
      {
        date: currentMonthDate(1, year),
        localName: "기념일",
        name: "Observance Day",
        countryCode: country,
        types: ["Observance"],
      },
      { date: "bad", localName: "skip", name: "skip", types: ["Public"] },
    ]);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
