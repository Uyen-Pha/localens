import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertSnapshotsEqual } from '../../scripts/test-research-cancellation-selected-local.mjs';

const sample = () => ({data:{bookings:[{id:'qa',status:'confirmed',private_note:'NEVER_PRINT_THIS'}]},catalog:[
  {kind:'class',id:'100',data:{relname:'bookings',relowner:10,relacl:['owner=arwd/owner'],relrowsecurity:true,
    relpages:1,reltuples:2,relallvisible:1,relallfrozen:0,relfrozenxid:'40',relminmxid:'50',relnatts:2}},
  {kind:'attribute',id:'100:1',data:{attname:'id',atttypid:2950,attnotnull:true}},
]});
test('vacuum statistics and horizons do not invalidate a semantic rollback', () => {
  const before=sample(), after=sample();
  Object.assign(after.catalog[0].data,{relpages:7,reltuples:19,relallvisible:5,relallfrozen:2,relfrozenxid:'99',relminmxid:'432'});
  assert.doesNotThrow(() => assertSnapshotsEqual(after,before));
});
for(const field of ['relowner','relacl','relrowsecurity','relnatts']) {
  test(`semantic class drift ${field} remains detectable`, () => {
    const before=sample(), after=sample(); after.catalog[0].data[field]='changed';
    assert.throws(() => assertSnapshotsEqual(after,before),/SNAPSHOT_MISMATCH/);
  });
}
test('column definition and missing catalog object remain detectable', () => {
  const before=sample(), after=sample(); after.catalog[1].data.atttypid=25;
  assert.throws(() => assertSnapshotsEqual(after,before),/attribute:100:1.*atttypid/);
  after.catalog.pop();
  assert.throws(() => assertSnapshotsEqual(after,before),/attribute:100:1.*missing/);
});
test('business row mismatch is bounded and never dumps row values', () => {
  const before=sample(), after=sample(); after.data.bookings[0].status='cancelled';
  assert.throws(() => assertSnapshotsEqual(after,before), (error) => {
    assert.match(error.message,/SNAPSHOT_MISMATCH.*data:bookings/);
    assert(error.message.length<1000);
    assert(!String(error.stack).includes('NEVER_PRINT_THIS'));
    assert(!('actual' in error));
    return true;
  });
});

const runner = fileURLToPath(new URL('../../scripts/test-research-cancellation-selected-local.mjs', import.meta.url));
// These invoke the real CLI: adding an apply mode or accepting a remote target
// must not accidentally reach a DB connection.
for (const args of [[], ['--apply'], ['--workdir','https://example.invalid/db'],
  ['--workdir','relative'], ['--workdir','D:/LocalLensSqlAudit/20260928-research-baseline','--upgrade']]) {
  test(`reject unsupported invocation ${JSON.stringify(args)}`, () => {
    const result = spawnSync(process.execPath,[runner,...args],{encoding:'utf8',windowsHide:true});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/ONLY_LOCAL_WORKDIR_ARGUMENT_ALLOWED/);
  });
}
