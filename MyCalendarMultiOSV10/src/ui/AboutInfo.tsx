import type { Messages } from "../domain/messages";
import { openHolidaySource } from "../platform/desktop";
import { APP_VERSION } from "../version";

export function AboutInfo({ t }: { t: Messages }) {
  return (
    <div className="about-info">
      <div className="about-head">
        <img className="about-icon" src="/favicon.png" alt="" width={64} height={64} />
        <div className="about-intro">
          <h2 className="about-name">{t.appName}</h2>
          <p>{t.aboutBody}</p>
        </div>
      </div>
      <dl className="about-grid">
        <dt>{t.version}</dt>
        <dd>{APP_VERSION}</dd>
        <dt>{t.holidaysSection}</dt>
        <dd>
          <p>{t.aboutHolidaySource}</p>
          <button type="button" className="text-btn solid" onClick={() => void openHolidaySource()}>
            {t.openSourcePage}
          </button>
        </dd>
      </dl>
    </div>
  );
}
