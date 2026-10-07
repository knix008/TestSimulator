import rulesUrl from "date-holidays-rules.json?url";
import zonesUrl from "moment-timezone/data/packed/latest.json?url";

async function fetchJson(url: string): Promise<object> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

/**
 * The holiday rules for about 200 countries (date-holidays, about 800 kB) and the time zone database the
 * rules are computed in (moment-timezone, about 700 kB) ship as JSON files next to the app. Loading them
 * as JSON keeps them out of the script bundle and parses faster than the same data as JavaScript.
 * The build maps `moment-timezone` to its core without data, so the zones have to be loaded before
 * the first holiday is computed.
 */
export async function loadHolidayRules(): Promise<object> {
  const [rules, zones, { default: moment }] = await Promise.all([fetchJson(rulesUrl), fetchJson(zonesUrl), import("moment-timezone")]);
  moment.tz.load(zones as Parameters<typeof moment.tz.load>[0]);
  return rules;
}
