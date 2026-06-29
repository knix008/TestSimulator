export function mapCountObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map(({ name, count, value }) => ({ name, value: Number(count ?? value ?? 0) }));
  }
  return Object.entries(obj || {}).map(([name, value]) => ({ name, value: Number(value) }));
}

export function statusOverviewEntries(byStatus) {
  if (Array.isArray(byStatus)) {
    return byStatus.map(({ name, count }) => [name, count]);
  }
  return Object.entries(byStatus || {});
}

export function groupRequirements(requirements, field) {
  const map = {};
  for (const req of requirements || []) {
    const key = req[field] || 'Unknown';
    map[key] = (map[key] || 0) + 1;
  }
  return Object.entries(map).map(([name, count]) => ({ name, count }));
}

export function buildReportChartData(report) {
  if (!report) {
    return {
      reqStatusData: [],
      tcStatusData: [],
      priorityData: [],
      categoryData: [],
    };
  }
  return {
    reqStatusData: mapCountObject(report.reqByStatus),
    tcStatusData: mapCountObject(report.tcByStatus),
    priorityData: groupRequirements(report.requirements, 'priority'),
    categoryData: groupRequirements(report.requirements, 'category'),
  };
}
