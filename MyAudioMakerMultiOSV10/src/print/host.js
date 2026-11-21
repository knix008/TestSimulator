// The main window's side of printing: the print window gets the song (small JSON) and the section
// names, and draws every sheet itself (print/sheet.js). Save as PDF on the web comes back here to be saved.

/** deps: { song(), popups, t, language(), labels(section), showError, saveExport, safeName } */
export function createPrintHost(deps) {
  function printInfo() {
    const song = deps.song();
    return {
      song, language: deps.language(), date: new Date().toLocaleDateString(deps.language() === 'en' ? 'en-US' : 'ko-KR'),
      labels: Object.fromEntries(song.sections.map((s) => [s.id, deps.labels(s)])),
    };
  }

  function open() {
    if (!deps.song()) return undefined;
    return deps.popups.open('print', { info: printInfo(), language: deps.language() });
  }

  async function savePdf(data) {
    try {
      const binary = atob(data.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      await deps.saveExport(data.name || `${deps.safeName()}.pdf`, 'pdf', bytes, 'application/pdf');
    } catch (error) {
      deps.showError('error.print', error, 'print');
    }
  }

  return { open, savePdf, printInfo };
}
