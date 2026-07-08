export function getStatusBarViewKey(pathname, { isAuthenticated = true } = {}) {
  if (!isAuthenticated || pathname === '/login') return 'statusBar.viewLogin';
  if (pathname === '/projects' || pathname === '/') return 'statusBar.viewProjects';
  if (pathname === '/requirements') return 'statusBar.viewRequirements';
  if (pathname === '/requirements/new') return 'statusBar.viewRequirementNew';
  if (/^\/requirements\/[^/]+\/edit$/.test(pathname)) return 'statusBar.viewRequirementEdit';
  if (pathname === '/test-cases') return 'statusBar.viewTestCases';
  if (pathname === '/users') return 'statusBar.viewUsers';
  if (pathname === '/ollama') return 'statusBar.viewOllama';
  if (pathname === '/settings') return 'statusBar.viewSettings';
  if (pathname === '/import') return 'statusBar.viewImport';
  if (pathname === '/export') return 'statusBar.viewExport';
  return 'statusBar.viewUnknown';
}
