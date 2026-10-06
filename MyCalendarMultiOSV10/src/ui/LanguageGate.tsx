export function LanguageGate({ onSelect }: { onSelect: (language: "ko" | "en") => void }) {
  return (
    <section className="panel gate">
      <p className="eyebrow">My Calendar</p>
      <h1>설치 언어를 선택하세요</h1>
      <h1 className="subhead">Choose your installation language</h1>
      <p className="lede">바탕화면 위에 두는 투명 캘린더</p>
      <p className="lede">A transparent calendar for your desktop</p>
      <div className="gate-actions">
        <button type="button" className="choice" onClick={() => onSelect("ko")}>
          한국어
        </button>
        <button type="button" className="choice" onClick={() => onSelect("en")}>
          English
        </button>
      </div>
    </section>
  );
}

export function Boot() {
  return (
    <div className="panel boot" role="status" aria-live="polite">
      <i className="spinner" />
    </div>
  );
}
