export function mapCountObject(obj) {
  return Object.entries(obj || {}).map(([name, value]) => ({ name, value: Number(value) }));
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
