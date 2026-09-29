import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cwd=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const localEnv={...process.env,CI:'1',LOCALENS_RUNTIME_BROWSER:'',
  PLAYWRIGHT_BASE_URL:'http://127.0.0.1:45101',
  NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:45102',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'local-test-key',
  LOCALENS_RUNTIME_ISOLATED_PROJECT_ID:'localens-itinerary-0123456789abcdef',
  LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR:path.join(tmpdir(),'localens-runtime-itinerary-playwright-reviewed-list'),
};
function discover(env) {
  return spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--list','--config=playwright.runtime-reviewed-booking.config.ts'],{cwd,env,encoding:'utf8',windowsHide:true});
}
test('discovers exactly the bilingual approved booking journeys without starting a server',()=>{
  const result=discover(localEnv);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/Total: 2 tests in 1 file/);
  assert.match(result.stdout,/runtime-reviewed-booking.spec.ts/);
  assert.match(result.stdout,/en approved reviewed booking/);
  assert.match(result.stdout,/vi approved reviewed booking/);
});
test('refuses hosted Supabase before browser execution',()=>{
  const result=discover({...localEnv,NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr+result.stdout,/requires a local Supabase URL/);
});
test('refuses presentation stack and unowned project before browser execution',()=>{
  for(const override of [{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321'},{LOCALENS_RUNTIME_ISOLATED_PROJECT_ID:'presentation'}]) {
    const result=discover({...localEnv,...override});
    assert.notEqual(result.status,0);
    assert.match(result.stderr+result.stdout,/isolated runner-owned project/);
  }
});
