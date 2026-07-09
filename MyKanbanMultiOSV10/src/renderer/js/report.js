/* Summary report export — Markdown, Word, PDF */
const ReportExport = (() => {
  let activeCache = null;
  const MIME = {
    md: 'text/markdown;charset=utf-8',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pdf: 'application/pdf',
  };

  function renderColumnDistImage(columns, totalCards) {
    const width = 640;
    const rowH = 36;
    const pad = { top: 28, right: 48, bottom: 24, left: 140 };
    const rows = columns.length || 1;
    const height = pad.top + pad.bottom + rows * rowH;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const max = Math.max(totalCards, 1);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    columns.forEach((col, i) => {
      const y = pad.top + i * rowH;
      const barMaxW = width - pad.left - pad.right;
      const barW = Math.max(4, (col.count / max) * barMaxW);

      ctx.fillStyle = '#64748B';
      ctx.font = '13px Segoe UI, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const label = String(col.title || '').slice(0, 18);
      ctx.fillText(label, pad.left - 10, y + rowH / 2);

      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(pad.left, y + 8, barMaxW, rowH - 16);

      const grad = ctx.createLinearGradient(pad.left, 0, pad.left + barW, 0);
      grad.addColorStop(0, '#6366F1');
      grad.addColorStop(1, '#818CF8');
      ctx.fillStyle = grad;
      ctx.fillRect(pad.left, y + 8, barW, rowH - 16);

      ctx.fillStyle = '#1E293B';
      ctx.textAlign = 'left';
      ctx.fillText(String(col.count), pad.left + barW + 8, y + rowH / 2);
    });

    return canvas.toDataURL('image/png');
  }

  function captureBurndownChart() {
    const canvas = document.getElementById('burndown-chart');
    if (!canvas) return null;
    try {
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  function collectImages(summaryData) {
    return {
      burndown: captureBurndownChart(),
      columnDist: renderColumnDistImage(summaryData.columns || [], summaryData.totalCards || 0),
    };
  }

  function base64ToBlob(b64, mime) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function saveBlob(filename, blob) {
    if (typeof window.electron !== 'undefined' && window.electron.saveReportFile) {
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return window.electron.saveReportFile(filename, base64, blob.type);
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true };
  }

  async function run(format, cache = activeCache) {
    if (!cache?.boardId || !cache?.data) {
      showToast(I18n.t('reportNoData'), 'error');
      return;
    }

    Modal.close();
    showToast(I18n.t('reportGenerating'), 'info', 2000);

    try {
      const images = collectImages(cache.data);
      const payload = {
        format,
        lang: I18n.getLang(),
        images: {
          burndown: images.burndown,
          columnDist: images.columnDist,
        },
      };

      const result = await API.post(`/boards/${cache.boardId}/report`, payload);
      const mime = result.mime || MIME[format];
      const blob = base64ToBlob(result.data, mime);
      const saveResult = await saveBlob(result.filename, blob);

      if (saveResult?.cancelled) return;
      if (saveResult?.ok === false) throw new Error(saveResult.error || I18n.t('exportSaveFailed'));
      showToast(I18n.t('reportSaved'), 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function showExportDialog(cache) {
    activeCache = cache;
    Modal.dialog({
      title: I18n.t('exportReport'),
      icon: '📄',
      size: 'sm',
      body: `<p class="modal-message">${I18n.t('exportReportDesc')}</p>`,
      footer: `
        ${Modal.btn({ label: 'Markdown', icon: '📝', variant: 'secondary', onclick: "ReportExport.run('md')" })}
        ${Modal.btn({ label: 'Word', icon: '📃', variant: 'secondary', onclick: "ReportExport.run('docx')" })}
        ${Modal.btn({ label: 'PDF', icon: '📕', variant: 'primary', onclick: "ReportExport.run('pdf')" })}`,
    });
  }

  return { run, showExportDialog, collectImages };
})();
