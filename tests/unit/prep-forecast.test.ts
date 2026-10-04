import test from 'node:test';
import assert from 'node:assert/strict';
import { prepForecast } from '../../src/lib/operations/prep-forecast';

test('prep forecast backtests item-level sales without future leakage and rounds suggestions up', () => {
  const now = new Date('2026-09-06T12:00:00Z');
  const sales = Array.from({ length: 56 }, (_, index) => ({ menuItemId: 'soup', quantity: 3, createdAt: new Date(Date.UTC(2026, 8, 6 - 56 + index, 12)) }));
  const forecast = prepForecast([{ id: 'soup', name: 'Soup' }, { id: 'salad', name: 'Salad' }], sales, now);
  assert.equal(forecast.items[0].unitsSold, 168);
  assert.equal(forecast.items[0].backtestMeanAbsoluteError, 0);
  assert.ok(forecast.items[0].days.every((day) => day.suggestedPrep === 3));
  assert.ok(forecast.items[1].days.every((day) => day.suggestedPrep === 0));
});
