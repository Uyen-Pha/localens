import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset, evaluateSample } from './build-planner-simulation-dataset.mjs';

const data = buildDataset();
const base = { placeIds: ['LL-R01','LL-R05'], date: '2026-09-15', startTime: '09:00', durationMinutes: 360, travelers: 2, budgetVnd: 5000000 };
const run = changes => evaluateSample(data, { ...base, ...changes });

test('all 30 profiles retain IDs and explicit simulation metadata', () => {
  assert.equal(data.places.length, 30);
  assert.equal(new Set(data.places.map(p=>p.placeId)).size, 30);
  assert.equal(data.places.filter(p=>p.simulationEligible).length, 26);
  for (const p of data.places) {
    assert.equal(p.realBookingEnabled, false);
    assert.equal(p.durationMinutes.isOfficial, false);
    assert.equal(p.maximumGuests.isOfficial, false);
    assert.ok(p.openingHours.windows.length);
    assert.ok(p.cost.visitPerPerson.value >= 0);
    assert.ok(p.cost.mealPerPerson.value >= 0);
    assert.equal(p.activity.workshopIncluded, false);
  }
});
test('all sample nodes have directed outward and return edges', () => {
  assert.equal(data.transferEdges.length, 31 * 30);
  assert.equal(new Set(data.transferEdges.map(e=>e.from+'>'+e.to)).size, 930);
  for (const e of data.transferEdges) {
    assert.ok(e.baseMinutes > 0);
    assert.equal(e.isLiveRouting, false);
    assert.ok(data.transferEdges.some(r=>r.from===e.to && r.to===e.from));
  }
});
test('observed food price is not charged as a ticket or double-counted', () => {
  const p = data.places.find(p=>p.placeId==='LL-R26');
  assert.equal(p.cost.visitPerPerson.value, 0);
  assert.equal(p.cost.mealPerPerson.value, 73000);
  assert.equal(p.cost.mealPerPerson.sourceId, 'huynhhoa-2026');
});
test('rejects unknown IDs and unconfirmed workshop operators', () => {
  assert.equal(run({placeIds:['invented']}).reason, 'unknown_place_id');
  assert.equal(run({placeIds:['LL-R29']}).reason, 'operator_not_identified');
  assert.equal(run({placeIds:['LL-R01','LL-R01']}).reason, 'empty_or_duplicate_places');
});
test('rejects invalid input without silently normalizing it', () => {
  assert.equal(run({date:'2026-02-30'}).reason, 'invalid_date');
  assert.equal(run({startTime:'09:99'}).reason, 'invalid_start');
  assert.equal(run({travelers:0}).reason, 'invalid_party_size');
  assert.equal(run({travelers:1.5}).reason, 'invalid_party_size');
});
test('group size must fit every place, not only the global limit', () => {
  assert.equal(run({placeIds:['LL-R25'],travelers:7}).reason, 'group_exceeds_place_limit');
});
test('preserves Monday closure and waits through museum lunch break', () => {
  assert.equal(run({placeIds:['LL-R04'],date:'2026-09-14'}).reason, 'outside_opening_hours');
  const result = run({placeIds:['LL-R04'],startTime:'11:00'});
  assert.equal(result.feasible, true);
  assert.equal(result.stops[0].arrival, '13:00');
  assert.ok(result.stops[0].waitMinutes > 0);
});
test('whole itinerary includes return and exact duration boundary', () => {
  const result = run({});
  assert.equal(result.feasible, true);
  assert.equal(result.legs.at(-1).to, 'ORIGIN-CENTER');
  assert.equal(run({durationMinutes:result.durationMinutes}).feasible, true);
  assert.equal(run({durationMinutes:result.durationMinutes-1}).reason, 'insufficient_duration_including_return');
  assert.equal(run({placeIds:['LL-R10'],durationMinutes:60}).reason, 'insufficient_duration_including_return');
});
test('charges group costs once and enforces budget boundary', () => {
  const one=run({travelers:1}), two=run({travelers:2});
  assert.equal(one.feasible,true); assert.equal(two.feasible,true);
  assert.equal(two.cost.transportVnd,one.cost.transportVnd);
  assert.equal(two.cost.guideVnd,one.cost.guideVnd);
  assert.equal(two.cost.totalVnd-one.cost.totalVnd,one.cost.perPersonVnd);
  assert.equal(run({budgetVnd:two.cost.totalVnd}).feasible,true);
  assert.equal(run({budgetVnd:two.cost.totalVnd-1}).reason,'insufficient_budget');
});
test('unknown dietary support does not satisfy Halal request', () => {
  assert.equal(run({placeIds:['LL-R26'],dietary:'halal'}).reason, 'dietary_support_not_confirmed');
});
