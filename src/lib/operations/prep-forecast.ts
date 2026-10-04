export type Sale = { menuItemId: string; quantity: number; createdAt: Date };
export type MenuEntry = { id: string; name: string };

const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const utcDay = (day: string) => new Date(`${day}T00:00:00.000Z`);

/** Descriptive, same-weekday forecast. Missing calendar days count as zero sales. */
export function prepForecast(menu: MenuEntry[], sales: Sale[], now: Date) {
  const today = utcDay(dayKey(now));
  const start = new Date(today.getTime() - 56 * 86_400_000);
  const daily = new Map<string, number>();
  for (const sale of sales) {
    if (!Number.isFinite(sale.quantity) || sale.quantity < 0 || sale.createdAt < start || sale.createdAt >= today) continue;
    const key = `${sale.menuItemId}:${dayKey(sale.createdAt)}`;
    daily.set(key, (daily.get(key) || 0) + sale.quantity);
  }
  const dates = Array.from({ length: 56 }, (_, index) => new Date(start.getTime() + index * 86_400_000));
  const next = Array.from({ length: 7 }, (_, index) => new Date(today.getTime() + index * 86_400_000));
  const mean = (itemId: string, target: Date, prior: Date[]) => {
    const sameWeekday = prior.filter((date) => date.getUTCDay() === target.getUTCDay());
    return sameWeekday.reduce((sum, date) => sum + (daily.get(`${itemId}:${dayKey(date)}`) || 0), 0) / Math.max(1, sameWeekday.length);
  };
  const items = menu.map((item) => {
    const unitsSold = dates.reduce((sum, date) => sum + (daily.get(`${item.id}:${dayKey(date)}`) || 0), 0);
    const errors = dates.slice(28).map((actual, index) =>
      Math.abs((daily.get(`${item.id}:${dayKey(actual)}`) || 0) - mean(item.id, actual, dates.slice(0, 28 + index))),
    );
    return {
      ...item,
      unitsSold,
      backtestMeanAbsoluteError: Number((errors.reduce((sum, value) => sum + value, 0) / errors.length).toFixed(2)),
      days: next.map((date) => ({ date: dayKey(date), baselineUnits: Number(mean(item.id, date, dates).toFixed(2)), suggestedPrep: Math.ceil(mean(item.id, date, dates)) })),
    };
  });
  return { method: 'Same-weekday mean of the previous eight completed UTC weeks', historyStart: dayKey(start), historyEnd: dayKey(new Date(today.getTime() - 86_400_000)), items };
}
