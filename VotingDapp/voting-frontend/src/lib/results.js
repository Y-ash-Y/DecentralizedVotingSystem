export function summarizeResults(results) {
  if (!results.length) return { status: "unavailable", leaders: [], total: 0 };
  const total = results.reduce((sum, row) => sum + row.votes, 0);
  if (total === 0) return { status: "no-votes", leaders: [], total };
  const maximum = Math.max(...results.map(row => row.votes));
  const leaders = results.filter(row => row.votes === maximum);
  return { status: leaders.length > 1 ? "tie" : "leader", leaders, total };
}
