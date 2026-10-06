import type { Messages } from "../domain/messages";
import { openHolidaySource } from "../platform/desktop";
import { APP_VERSION, HOLIDAY_API } from "../version";

export function AboutInfo({ t }: { t: Messages }) {
  const features = [t.featureTransparent, t.featureThemes, t.featureHolidays, t.featureTray];
  return (
    <div className="about-info">
      <div className="about-head">
        <img className="about-icon" src="/favicon.png" alt="" width={64} height={64} />
        <div className="about-intro">
          <h2 className="about-name">{t.appName}</h2>
          <p>{t.aboutBody}</p>
          <p className="hint">{t.closeToTray}</p>
        </div>
      </div>
      <dl className="about-grid">
        <dt>{t.version}</dt>
        <dd>{APP_VERSION}</dd>
        <dt>{t.featuresTitle}</dt>
        <dd>
          <ul className="feature-list">
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </dd>
        <dt>{t.aboutPlatformsLabel}</dt>
        <dd>{t.aboutPlatforms}</dd>
        <dt>{t.language}</dt>
        <dd>{t.installLanguageHelp}</dd>
        <dt>{t.holidaysSection}</dt>
        <dd>
          <p>{t.aboutHolidaySource}</p>
          <p>{t.aboutDataNote}</p>
          <button type="button" className="text-btn solid" onClick={() => void openHolidaySource()}>
            {t.openSourcePage}
          </button>
          <p className="hint">{HOLIDAY_API.replace("https://", "")}</p>
        </dd>
      </dl>
    </div>
  );
}
