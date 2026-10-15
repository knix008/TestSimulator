// FreeCAD's Test workbench: MyCAD's self-tests from inside the app — in a
// window or as text in the script console — the Test menu, and a test feature.
import { hasIcon } from '../icons.js';
import { runSelfTests, SELF_TESTS, workTests } from '../selftest.js';

export const SELF_TEST_GROUPS = [...Object.keys(SELF_TESTS), 'work'];

export function testCommands(app) {
  const { t, state } = app;
  const run = (groups) => runSelfTests(groups, { work: workTests(app.commands, t, hasIcon) });

  async function showResults(groups) {
    const results = run(groups);
    const failed = results.filter((r) => !r.ok);
    await app.form({
      title: t('test.results'), icon: 'checklist', width: 720,
      intro: failed.length ? t('test.failed', { failed: failed.length, total: results.length }) : t('test.passed', { total: results.length }),
      fields: [{ key: 'results', type: 'textarea', label: t('test.list'), icon: 'checklist', rows: Math.min(16, results.length + 1), readonly: true, value: results.map((r) => `${r.ok ? '✔' : '✖'} ${r.group} › ${r.name} (${r.ms.toFixed(1)} ms)${r.ok ? '' : `\n    ${r.error}`}`).join('\n') }],
      actions: [{ id: 'ok', label: t('error.close'), primary: true }],
    });
    return results;
  }

  function printResults(groups) {
    const results = run(groups);
    if (!state.settings.showConsole) app.updateSettings({ showConsole: true });
    for (const r of results) app.consoleLog(r.ok ? 'info' : 'error', `${r.ok ? '✔' : '✖'} ${r.group} › ${r.name} (${r.ms.toFixed(1)} ms)${r.ok ? '' : ` — ${r.error}`}`);
    const failed = results.filter((r) => !r.ok).length;
    app.consoleLog(failed ? 'error' : 'info', failed ? t('test.failed', { failed, total: results.length }) : t('test.passed', { total: results.length }));
    return results;
  }

  async function chooseDialog() {
    const answer = await app.form({
      title: t('test.selfTest'), icon: 'checklist', width: 520, intro: t('test.chooseIntro'),
      fields: SELF_TEST_GROUPS.map((group) => ({ key: group, type: 'check', label: t(`test.group.${group}`), icon: 'checklist', value: true })),
      actions: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'run', label: t('test.run'), icon: 'play', primary: true }],
    });
    if (answer?.action === 'run') await showResults(SELF_TEST_GROUPS.filter((group) => answer.values[group]));
  }

  return {
    selfTest: { icon: 'checklist', label: 'test.selfTest', run: () => chooseDialog() },
    'selfTest:all': { icon: 'checklist', label: 'test.all', run: () => showResults(SELF_TEST_GROUPS) },
    'selfTest:allText': { icon: 'console', label: 'test.allText', run: () => printResults(SELF_TEST_GROUPS) },
    'selfTest:base': { icon: 'checklist', label: 'test.base', run: () => showResults(['base']) },
    'selfTest:baseText': { icon: 'console', label: 'test.baseText', run: () => printResults(['base']) },
    'selfTest:doc': { icon: 'checklist', label: 'test.doc', run: () => showResults(['doc']) },
    'selfTest:docText': { icon: 'console', label: 'test.docText', run: () => printResults(['doc']) },
    'selfTest:work': { icon: 'checklist', label: 'test.work', run: () => showResults(['work']) },
    testMenuShow: { icon: 'checklist', label: 'test.menuShow', enabled: () => !state.settings.testMenu, run: () => app.updateSettings({ testMenu: true }) },
    testMenuHide: { icon: 'checklist', label: 'test.menuHide', enabled: () => Boolean(state.settings.testMenu), run: () => app.updateSettings({ testMenu: false }) },
    insertTestFeature: {
      icon: 'solidBox', label: 'test.insertFeature', enabled: () => Boolean(app.activeDoc()),
      run: () => { const entity = app.insertSolid('box', { length: 1, width: 1, height: 1 }, {}); app.change('test.op.feature', (d) => app.D.updateEntity(d, entity.id, { name: 'TestFeature' })); },
    },
  };
}

/** The Test menu (shown with Test_TestCreateMenu). */
export const TEST_MENU = ['selfTest', 'selfTest:all', 'selfTest:allText', '-', 'selfTest:base', 'selfTest:baseText', 'selfTest:doc', 'selfTest:docText', 'selfTest:work', '-', 'insertTestFeature', '-', 'testMenuHide'];

export const TEST_FREECAD = {
  Test_Test: 'selfTest', Test_TestAll: 'selfTest:all', Test_TestAllText: 'selfTest:allText', Test_TestBase: 'selfTest:base', Test_TestBaseText: 'selfTest:baseText',
  Test_TestDoc: 'selfTest:doc', Test_TestDocText: 'selfTest:docText', Test_TestWork: 'selfTest:work', Test_TestCreateMenu: 'testMenuShow', Test_TestDeleteMenu: 'testMenuHide',
  Test_InsertFeature: 'insertTestFeature',
};
