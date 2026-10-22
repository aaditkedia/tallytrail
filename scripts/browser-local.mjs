/** Local-only browser regression checks. Requires an installed Playwright/Core and Chromium. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright-core')); }
catch { throw new Error('Install playwright-core or set PLAYWRIGHT_MODULE_PATH to an existing installation. Set BROWSER_EXECUTABLE if Chromium is not installed through Playwright.'); }
const apps = ['tallytrail', 'greengate', 'quorum', 'suppliers', 'proof'];
const selected = process.argv.slice(2);
assert(selected.every(app => apps.includes(app)), 'Choose one or more app identifiers.');
const output = resolve(root, process.env.BROWSER_ARTIFACT_DIR || 'test-results/browser');
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), 'hackathon-browser-'));
const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
for (const flag of ['TALLYTRAIL_GEMINI_ENABLED', 'GITLAB_READ_ENABLED', 'QUORUM_ENABLE_LIVE', 'SUPPLIERS_ENABLE_STRIPE_TEST', 'YOUCAM_ENABLE_LIVE', 'YOUCAM_ENABLE_EXPLORATION', 'YOUCAM_CAMERA_KIT_ENABLED']) environment[flag] = 'false';
for (const app of apps) environment[`${app.toUpperCase()}_DATA_DIR`] = join(temporary, app);
for (const app of ['QUORUM', 'SUPPLIERS', 'PROOF']) environment[`${app}_SESSION_SECRET`] = randomBytes(32).toString('hex');
const results = [];
const production = process.env.BROWSER_SERVER_MODE === 'production';
let browser;

async function visible(page, text) { await page.getByText(text).first().waitFor({ state: 'visible', timeout: 15000 }); }
// Browser fetch preserves Chromium's secure-cookie policy for trusted loopback origins.
// Playwright's separate HTTP cookie jar does not model that exception in production.
async function browserJson(page, path) {
  return page.evaluate(async path => { const response = await fetch(path, { cache: 'no-store' }); return { status: response.status, data: await response.json() }; }, path);
}
async function browserStatus(page, path) {
  return page.evaluate(async path => { const response = await fetch(path, { cache: 'no-store' }); await response.body?.cancel(); return response.status; }, path);
}
async function layout(page, app, viewport) {
  await page.setViewportSize(viewport);
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  // CSS transitions must settle before measuring the responsive layout.
  await page.waitForTimeout(150);
  const metrics = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, title: document.title,
    overflow: [...document.querySelectorAll('body *')].map(element => ({ element, bounds: element.getBoundingClientRect() })).filter(({ element, bounds }) => bounds.width > 0 && bounds.right > innerWidth + 1 && !element.closest('nextjs-portal')).slice(0, 30).map(({ element, bounds }) => ({ tag: element.tagName, class: element.className?.baseVal ?? element.className, right: bounds.right, width: bounds.width })),
    unnamedNodes: [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width && !b.closest('nextjs-portal') && ![b.innerText, b.getAttribute('aria-label'), b.getAttribute('title')].some(s => s?.trim())).map(b => b.outerHTML),
    unnamed: [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width && !b.closest('nextjs-portal') && ![b.innerText, b.getAttribute('aria-label'), b.getAttribute('title')].some(s => s?.trim())).length }));
  // Use computed accessible names and visibility, including labels on nested controls.
  const unnamed = page.getByRole('button', { name: '', exact: true });
  metrics.unnamed = await unnamed.count();
  metrics.unnamedNodes = await unnamed.evaluateAll(buttons => buttons.map(button => button.outerHTML));
  await writeFile(join(output, `${app}-${viewport.width}-layout.json`), JSON.stringify(metrics, null, 2) + '\n');
  assert(metrics.title, `${app}: missing page title`);
  assert(metrics.scroll <= metrics.width + 1, `${app}: horizontal overflow ${metrics.scroll}px at ${metrics.width}px`);
  assert.equal(metrics.unnamed, 0, `${app}: visible buttons without accessible names`);
  await page.screenshot({ path: join(output, `${app}-${viewport.width}.png`), fullPage: true });
}

const flows = {
  async tallytrail(page) {
    await page.getByRole('button', { name: 'Try a sample report' }).click();
    await page.getByRole('button', { name: 'Analyze evidence' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await visible(page, '1,634.89');
    const confirm = dialog.getByRole('button', { name: 'Confirm local report' });
    assert(await confirm.isDisabled(), 'TallyTrail confirmation needs explicit acknowledgement');
    await dialog.getByRole('checkbox').check();
    await confirm.click();
    await dialog.getByRole('link', { name: 'Open verification' }).waitFor();
    const verification = await dialog.getByRole('link', { name: 'Open verification' }).getAttribute('href');
    await dialog.getByRole('button', { name: 'Close report' }).click();
    const receipt = await browserJson(page, verification.replace('/verify/', '/api/verify/'));
    assert.equal(receipt.status, 200, 'Confirmed report exposes a verification receipt');
    const report = receipt.data;
    assert(!JSON.stringify(report).includes('Juniper Bakery'), 'Verification receipt must omit private business identity');
  },
  async greengate(page) {
    await page.getByRole('button', { name: 'Run demo workflow' }).click();
    const approve = page.getByRole('button', { name: 'Approve local simulation' });
    await approve.waitFor({ timeout: 20000 });
    assert(await approve.isDisabled(), 'GreenGate approval needs acknowledgement');
    await page.getByRole('checkbox').check();
    await approve.click();
    await visible(page, 'Local approval recorded for this exact demo revision.');
    await page.getByLabel('Synthetic scenario').selectOption('security-block');
    await page.getByRole('button', { name: 'Run demo workflow' }).click();
    await visible(page, 'A synthetic check failed. Approval is blocked; inspect the evidence.');
    assert.equal(await approve.count(), 0, 'Blocked GreenGate run cannot expose an approval action');
  },
  async quorum(page) {
    await page.getByRole('button', { name: 'Try the working demo' }).click();
    await visible(page, /Friday Social/i);
    await page.getByRole('button', { name: 'See the happiness matrix' }).click();
    await page.getByRole('heading', { name: 'The happiness matrix' }).waitFor();
    assert.equal(await page.getByRole('table').getByRole('row').count(), 5, 'All four group members appear in the matrix');
    await page.reload();
    await visible(page, /Friday Social/i);
    const eventId = await page.evaluate(() => localStorage.getItem('quorum-event'));
    const response = await browserJson(page, `/api/events/${eventId}`);
    assert.equal(response.status, 200, 'Organizer can read their event');
    const event = response.data;
    const origin = new URL(page.url()).origin;
    const attendeeContext = await page.context().browser().newContext({ baseURL: origin, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    try {
      await attendeeContext.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const attendee = await attendeeContext.newPage();
      await attendee.goto(event.joinPath);
      await attendee.getByLabel('Your name', { exact: true }).fill('Browser-test guest');
      for (let i = 0; i < 3; i++) await attendee.locator('form button[aria-pressed]').nth(i).click();
      await attendee.getByRole('button', { name: 'Add my voice' }).click();
      await attendee.getByRole('button', { name: 'Edit my taste' }).waitFor();
      await attendee.reload();
      await attendee.getByRole('button', { name: 'Edit my taste' }).waitFor();
      assert.equal(await attendee.getByRole('button', { name: 'Find our common ground' }).count(), 0, 'Attendee cannot generate plans');
      await page.getByRole('button', { name: 'Find our common ground' }).waitFor({ timeout: 15000 });
      await visible(page, '5 people');
      await page.getByRole('button', { name: 'Find our common ground' }).click();
      await page.getByRole('button', { name: 'See the happiness matrix' }).waitFor();
    } finally { await attendeeContext.close(); }
  },
  async suppliers(page) {
    await page.getByRole('button', { name: 'Open workspace' }).click();
    await page.getByRole('button', { name: 'Add your first evidence' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Add your first evidence' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Create report for review' }).click();
    await page.getByRole('button', { name: 'Confirm report' }).waitFor();
    assert(await page.getByRole('button', { name: 'Confirm report' }).isDisabled(), 'Supplier report confirmation needs acknowledgement');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Confirm report' }).click();
    await visible(page, 'Owner confirmed');
    await page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('button', { name: 'Questionnaires' }).click();
    await page.getByRole('button', { name: 'Generate evidence-linked draft' }).click();
    const approve = page.getByRole('button', { name: 'Approve for export' });
    await approve.waitFor();
    assert(await approve.isDisabled(), 'Supplier export approval needs both acknowledgements');
    for (const box of await page.getByRole('checkbox').all()) await box.check();
    await approve.click();
    const exportLink = page.getByRole('link', { name: 'Download approved answers' });
    await exportLink.waitFor();
    const exported = await browserJson(page, await exportLink.getAttribute('href'));
    assert.equal(exported.status, 200);
    assert.equal(exported.data.answers.filter(answer => answer.status === 'gap').length, 2);
    await page.getByLabel('Questionnaire name').fill('Synthetic private draft for the first organization');
    await page.getByLabel('Switch organization', { exact: true }).selectOption({ index: 1 });
    await page.waitForFunction(() => [...document.querySelectorAll('input')].some(input => input.value === 'Buyer sustainability questionnaire'));
    assert.equal(await page.getByLabel('Questionnaire name').inputValue(), 'Buyer sustainability questionnaire', 'Organization changes clear the previous organization\'s unsaved draft');
    assert.equal(await page.getByRole('link', { name: 'Download approved answers' }).count(), 0, 'The second organization cannot see the first export');
    await page.getByLabel('Switch organization', { exact: true }).selectOption({ index: 0 });
    await page.getByLabel('Demo role', { exact: true }).selectOption('auditor');
    await visible(page, /Auditor view/);
    assert(await page.getByRole('button', { name: 'Generate evidence-linked draft' }).isDisabled(), 'Auditor cannot create a draft');
    await page.getByLabel('Demo role', { exact: true }).selectOption('owner');
    await page.getByText(/Auditor view/).waitFor({ state: 'hidden' });
    await page.getByRole('link', { name: 'Download approved answers' }).waitFor();
  },
  async proof(page) {
    await page.getByRole('button', { name: 'Try sample journey' }).click();
    await visible(page, '4 check-ins');
    await page.getByRole('button', { name: 'My routine', exact: true }).first().click();
    await page.getByLabel('Product name').fill('Synthetic browser-test serum');
    await page.getByRole('button', { name: 'Add to my routine' }).click();
    await visible(page, 'Synthetic browser-test serum');
    await page.getByRole('button', { name: 'Check-in', exact: true }).first().click();
    assert(await page.getByRole('button', { name: 'Analyze with YouCam' }).isDisabled(), 'Live analysis must be disabled without keys/consent');
    // A generated color block exercises the private upload path without a person's photo.
    const fixture = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512; const context = canvas.getContext('2d'); context.fillStyle = '#eadfd4'; context.fillRect(0, 0, 512, 512); return canvas.toDataURL('image/png').split(',')[1]; });
    await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-color-block.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64') });
    for (const text of ['Even light, no filters or makeup', 'Face forward; face fills over 60% of photo width', 'Same setup as my previous check-in', 'I want to save this photo in my private journal.']) await page.getByLabel(text, { exact: true }).check();
    await page.getByRole('button', { name: 'Save private capture' }).click();
    await visible(page, 'Photo saved privately. It has not been sent to YouCam.');
    const state = await browserJson(page, '/api/state');
    assert.equal(state.status, 200);
    assert.equal(state.data.state.media.length, 1, 'One private capture was saved');
    const mediaPath = `/api/media/${state.data.state.media[0].id}`;
    assert.equal(await browserStatus(page, mediaPath), 200);
    const stranger = await page.context().browser().newContext();
    try { assert.notEqual((await stranger.request.get(new URL(mediaPath, page.url()).href)).status(), 200, 'A different session cannot read private media'); }
    finally { await stranger.close(); }
    await page.getByRole('button', { name: 'Overview', exact: true }).first().click();
  },
};

try {
  const executablePath = process.env.BROWSER_EXECUTABLE || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(path => existsSync(path));
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  for (const app of selected.length ? selected : apps) {
    const port = 3101 + apps.indexOf(app);
    const origin = `http://127.0.0.1:${port}`;
    try { await fetch(origin, { signal: AbortSignal.timeout(750) }); throw new Error(`Port ${port} is already serving; stop that app first.`); }
    catch (error) { if (error.message.includes('already serving')) throw error; }
    const log = await open(join(temporary, `${app}.log`), 'w');
    const args = [join(root, 'node_modules/next/dist/bin/next'), ...(production ? ['start'] : ['dev', '--webpack']), '--hostname', '127.0.0.1', '--port', String(port)];
    const server = spawn(process.execPath, args, { cwd: join(root, 'apps', app), env: environment, stdio: ['ignore', log.fd, log.fd], detached: true });
    await log.close();
    let context;
    let page;
    try {
      const deadline = Date.now() + 60000;
      while (true) {
        try { const response = await fetch(origin, { signal: AbortSignal.timeout(3000) }); if (response.ok) break; }
        catch { /* Wait only for this owned server to start. */ }
        assert(server.exitCode === null && Date.now() < deadline, `${app}: server did not start`);
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.setDefaultNavigationTimeout(30000);
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      // Prevent accidental external requests even if future code bypasses a feature flag.
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await page.goto(origin, { waitUntil: 'networkidle' });
      await flows[app](page);
      await layout(page, app, { width: 1440, height: 1000 });
      await layout(page, app, { width: 390, height: 844 });
      const missing = await page.goto(`${origin}/this-page-does-not-exist`);
      assert.equal(missing.status(), 404, `${app}: unknown page must return 404`);
      await page.getByRole('link', { name: /^Return to / }).waitFor();
      assert.deepEqual(pageErrors, [], `${app}: uncaught browser errors`);
      results.push({ app, passed: true, viewports: [1440, 390], flow: true, uncaughtErrors: pageErrors });
      for (const suffix of ['failure.png', 'failure.txt', 'server.log']) await rm(join(output, `${app}-${suffix}`), { force: true });
      console.log(`${app}: browser workflow, desktop/mobile layout and runtime checks passed`);
    } catch (error) {
      results.push({ app, passed: false, error: error.message });
      console.error(`${app}: ${error.message}`);
      if (page) {
        await page.screenshot({ path: join(output, `${app}-failure.png`), fullPage: true }).catch(() => {});
        await writeFile(join(output, `${app}-failure.txt`), await page.locator('body').innerText().catch(() => 'Page unavailable'));
      }
      await writeFile(join(output, `${app}-server.log`), await readFile(join(temporary, `${app}.log`)));
      process.exitCode = 1;
    } finally {
      await context?.close();
      try { process.kill(-server.pid, 'SIGTERM'); } catch { /* Server already exited. */ }
      await Promise.race([new Promise(resolve => server.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
      try { process.kill(-server.pid, 'SIGKILL'); } catch { /* No owned process remains. */ }
    }
  }
} finally {
  await browser?.close();
  await writeFile(join(output, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), serverMode: production ? 'production' : 'development', liveIntegrations: false, results }, null, 2) + '\n');
  await rm(temporary, { recursive: true, force: true });
}
