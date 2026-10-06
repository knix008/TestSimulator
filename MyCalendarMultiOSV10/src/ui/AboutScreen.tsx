import { APP_VERSION, HOLIDAY_API } from "../version";
import { openHolidaySource } from "../platform/desktop";
import type { ReadyContext } from "./useSettings";
import { WindowChrome } from "./WindowChrome";

export function AboutScreen({ ctx, onClose }: { ctx: ReadyContext; onClose: () => void }) {
  const { t } = ctx;
  const features = [t.featureTransparent, t.featureThemes, t.featureHolidays, t.featurePlatforms, t.featureTray];
  return (
    <section className="panel screen about-screen">
      <WindowChrome title={t.about} closeLabel={t.close} onClose={onClose} />
      <div className="screen-body">
        <p className="eyebrow">{t.appName}</p>
        <p className="version">
          {t.version} {APP_VERSION}
        </p>
        <p>{t.aboutBody}</p>
        <p>{t.closeToTray}</p>
        <h2>{t.featuresTitle}</h2>
        <ul className="feature-list">
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
        <h2>{t.aboutPlatformsLabel}</h2>
        <p>{t.aboutPlatforms}</p>
        <h2>{t.language}</h2>
        <p>{t.installLanguageHelp}</p>
        <h2>{t.holidaysSection}</h2>
        <p>{t.aboutHolidaySource}</p>
        <p>{t.aboutDataNote}</p>
        <button type="button" className="text-btn solid" onClick={() => void openHolidaySource()}>
          {t.openSourcePage}
        </button>
        <p className="hint">{HOLIDAY_API.replace("https://", "")}</p>
      </div>
    </section>
  );
}
