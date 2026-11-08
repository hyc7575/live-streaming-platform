// Throwaway OME spike runner (issue #2). Usage: node run.mjs [full|ice-probe]
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] ?? 'full';
const OUT = join(here, 'out', mode);
const OME = process.env.OME_URL ?? 'http://127.0.0.1:3333';
const API = process.env.OME_API_URL ?? 'http://127.0.0.1:8081';
const API_AUTH =
  'Basic ' +
  Buffer.from(process.env.OME_API_ACCESS_TOKEN ?? 'spike-api-token').toString(
    'base64',
  );
const WEBHOOK = 'http://127.0.0.1:18080';
const STATIC_PORT = 18081;
const CONTAINER = process.env.OME_CONTAINER ?? 'lsp-spike-ome-1';
const run = Date.now().toString(36);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const results = { mode, run, startedAt: new Date().toISOString(), checks: {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) =>
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

const vendor = {
  '/vendor/OvenLiveKit.min.js': join(
    here,
    'node_modules/ovenlivekit/dist/OvenLiveKit.min.js',
  ),
  '/vendor/hls.min.js': join(here, 'node_modules/hls.js/dist/hls.min.js'),
};
const staticServer = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  const file = vendor[path] ?? join(here, 'web', path);
  let data;
  try {
    data = readFileSync(file);
  } catch {
    return res.writeHead(404).end();
  }
  const type = extname(file) === '.html' ? 'text/html' : 'text/javascript';
  res.writeHead(200, { 'content-type': type }).end(data);
}).listen(STATIC_PORT);

let webhook;
process.on('exit', () => webhook?.kill('SIGKILL'));
async function startWebhook() {
  const stale = await fetch(`${WEBHOOK}/events`).then(
    () => true,
    () => false,
  );
  if (stale)
    throw new Error('port 18080 already has a webhook (stale process?)');
  webhook = spawn(process.execPath, [join(here, 'webhook.mjs')], {
    env: { ...process.env, WEBHOOK_LOG: join(OUT, 'webhook-events.jsonl') },
    stdio: 'inherit',
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${WEBHOOK}/events`);
      return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error('webhook did not start');
}
async function stopWebhook() {
  webhook.kill('SIGKILL');
  await new Promise((r) => webhook.once('exit', r));
}
const hook = async (path, body) =>
  (
    await fetch(
      `${WEBHOOK}${path}`,
      body ? { method: 'POST', body: JSON.stringify(body) } : {},
    )
  ).json();
const tokenFor = async (stream) =>
  (await hook(`/token?stream=${stream}`)).token;
const omeApi = async (method, path) => {
  const res = await fetch(`${API}/v1${path}`, {
    method,
    headers: { authorization: API_AUTH },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const whipUrl = (stream, token) =>
  `${OME}/app/${stream}?direction=whip${token ? `&token=${token}` : ''}`;
const eventsFor = async (stream) =>
  (await hook('/events')).filter((e) => e.url?.includes(`/${stream}`));
const dockerLogs = (arg) => {
  const r = spawnSync('docker', ['logs', arg, CONTAINER], {
    maxBuffer: 1 << 28,
  });
  return (r.stdout.toString() + r.stderr.toString()).replace(
    /\x1b\[[0-9;]*m/g,
    '',
  );
};
const dockerCpu = () =>
  execFileSync('docker', [
    'stats',
    '--no-stream',
    '--format',
    '{{.CPUPerc}} {{.MemUsage}}',
    CONTAINER,
  ])
    .toString()
    .trim();

const browser = await chromium.launch({
  channel: 'chrome',
  headless: process.env.HEADED ? false : true,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const context = await browser.newContext({
  viewport: { width: 1000, height: 700 },
});

async function openPublisher() {
  const page = await context.newPage();
  page.on('console', (m) => {
    if (/error|fail|Endpoint|Location/i.test(m.text()))
      say('[publisher console]', m.text().slice(0, 200));
  });
  await page.goto(`http://127.0.0.1:${STATIC_PORT}/publish.html`);
  return page;
}
// Returns { ok, outcome, log } without throwing, so one failed scenario never stops the others.
async function tryPublish(
  page,
  url,
  timeoutMs = 15000,
  connectionConfig = {},
  audio = true,
) {
  const t0 = Date.now();
  const outcome = await page.evaluate(
    ([u, t, c, a]) =>
      Promise.race([
        window.publish(u, c, a).then((v) => ({ ok: true, v })),
        new Promise((r) => setTimeout(() => r({ ok: false, v: 'timeout' }), t)),
      ]).catch((e) => ({ ok: false, v: String(e) })),
    [url, timeoutMs, connectionConfig, audio],
  );
  const log = await page.evaluate(() => window.spikeLog);
  return {
    ok: outcome.ok,
    outcome: outcome.v,
    elapsedMs: Date.now() - t0,
    log,
  };
}

async function check(name, fn) {
  say(`--- ${name}`);
  try {
    results.checks[name] = await fn();
  } catch (e) {
    results.checks[name] = { error: String(e?.stack ?? e) };
  }
  say(name, JSON.stringify(results.checks[name]).slice(0, 600));
}

await startWebhook();

if (mode === 'ice-probe') {
  await check('ice-probe', async () => {
    const s = `ice${run}`;
    const page = await openPublisher();
    const r = await tryPublish(page, whipUrl(s, await tokenFor(s)), 20000);
    const stats = r.ok
      ? await page.evaluate(() => window.outboundStats())
      : null;
    const omeLog = dockerLogs(`--since=${results.startedAt}`);
    const answerCandidates = [
      ...new Set(omeLog.split('\n').filter((l) => l.startsWith('a=candidate'))),
    ];
    return { ...r, remoteCandidate: stats?.remoteCandidate, answerCandidates };
  });
} else {
  const s1 = `s1${run}`;

  await check('idle-cpu', async () => {
    const samples = [];
    for (let i = 0; i < 3; i++) samples.push(dockerCpu());
    return { samples };
  });

  await check('reject-no-token', async () => {
    const s = `nt${run}`;
    const r = await tryPublish(await openPublisher(), whipUrl(s, null));
    return {
      publish: r,
      webhook: await eventsFor(s),
      stream: (await omeApi('GET', `/vhosts/default/apps/app/streams/${s}`))
        .status,
    };
  });

  await check('reject-bad-token', async () => {
    const s = `bt${run}`;
    const r = await tryPublish(
      await openPublisher(),
      whipUrl(s, 'not-a-real-token'),
    );
    return { publish: r, webhook: await eventsFor(s) };
  });

  await check('reject-forged-signature', async () => {
    const body = JSON.stringify({
      client: {},
      request: {
        direction: 'incoming',
        protocol: 'webrtc',
        status: 'opening',
        url: `ws://x/app/${s1}?token=${await tokenFor(s1)}`,
      },
    });
    const res = await fetch(`${WEBHOOK}/admission`, {
      method: 'POST',
      headers: { 'x-ome-signature': 'forged' },
      body,
    });
    return { status: res.status, body: await res.json() };
  });

  let publishConnectedAt;
  const publisher = await openPublisher();
  await check('publish-with-token', async () => {
    const r = await tryPublish(publisher, whipUrl(s1, await tokenFor(s1)));
    publishConnectedAt = Date.now();
    await sleep(4000);
    const cpu1Pub0View = [];
    for (let i = 0; i < 3; i++) cpu1Pub0View.push(dockerCpu());
    return {
      publish: r,
      outbound: await publisher.evaluate(() => window.outboundStats()),
      cpu1Pub0View,
      webhook: await eventsFor(s1),
    };
  });
  await publisher.screenshot({ path: join(OUT, 'publisher.png') });

  await check('ome-stream-info', async () => {
    const info = await omeApi('GET', `/vhosts/default/apps/app/streams/${s1}`);
    writeFileSync(
      join(OUT, 'ome-stream-info.json'),
      JSON.stringify(info.body, null, 2),
    );
    const r = info.body?.response;
    return {
      status: info.status,
      inputTracks: r?.input?.tracks?.map((t) => ({
        type: t.type,
        codec: t.video?.codec ?? t.audio?.codec,
        bypass: t.video?.bypass ?? t.audio?.bypass,
        width: t.video?.width,
        height: t.video?.height,
      })),
      outputs: r?.outputs?.map((o) => ({
        name: o.name,
        tracks: o.tracks?.map((t) => ({
          type: t.type,
          codec: t.video?.codec ?? t.audio?.codec,
          bypass: t.video?.bypass ?? t.audio?.bypass,
        })),
      })),
    };
  });

  const viewers = [];
  // OME answers 404 until the first LL-HLS segment exists, and hls.js treats that as fatal.
  await check('playlist-ready', async () => {
    const polls = [];
    for (let i = 0; i < 60; i++) {
      const res = await fetch(`${OME}/app/${s1}/llhls.m3u8`);
      const body = await res.text();
      polls.push(res.status);
      if (res.status === 200) {
        return {
          readyAfterPublishConnectedMs: Date.now() - publishConnectedAt,
          statuses: polls.join(','),
          playlist: body.slice(0, 600),
        };
      }
      await sleep(500);
    }
    return { readyAfterPublishConnectedMs: null, statuses: polls.join(',') };
  });

  await check('playback-3-viewers', async () => {
    for (let i = 0; i < 3; i++) {
      const p = await context.newPage();
      await p.goto(
        `http://127.0.0.1:${STATIC_PORT}/play.html?src=${encodeURIComponent(`${OME}/app/${s1}/llhls.m3u8`)}`,
      );
      viewers.push(p);
    }
    await sleep(8000);
    const first = await Promise.all(
      viewers.map((p) => p.evaluate(() => window.snapshot())),
    );
    const cpu = [];
    for (let i = 0; i < 5; i++) {
      cpu.push(dockerCpu());
      await sleep(1000);
    }
    const second = await Promise.all(
      viewers.map((p) => p.evaluate(() => window.snapshot())),
    );
    const audio = await Promise.all(
      viewers.map((p) => p.evaluate(() => window.audioPeak(2500))),
    );
    await viewers[0].screenshot({ path: join(OUT, 'viewer.png') });
    // Glass-to-glass pairs: the fake camera burns a clock into each frame. Read both images:
    // latency = (publisher clock + (viewerShotAt - publisherShotAt)) - viewer clock.
    const g2g = [];
    for (let i = 0; i < 3; i++) {
      const publisherShotAt = Date.now();
      await publisher.screenshot({
        path: join(OUT, `g2g-${i}-publisher.png`),
        clip: { x: 0, y: 0, width: 660, height: 380 },
      });
      const viewerShotAt = Date.now();
      await viewers[0].screenshot({
        path: join(OUT, `g2g-${i}-viewer.png`),
        clip: { x: 0, y: 0, width: 660, height: 380 },
      });
      g2g.push({ viewerMinusPublisherShotMs: viewerShotAt - publisherShotAt });
      await sleep(1500);
    }
    return { first, second, audio, cpuDuring1Pub3View: cpu, g2g };
  });

  await check('force-end', async () => {
    const t0 = Date.now();
    await hook('/end', { stream: s1 });
    const del = await omeApi(
      'DELETE',
      `/vhosts/default/apps/app/streams/${s1}`,
    );
    let closedAfterMs = null;
    for (let i = 0; i < 40 && closedAfterMs === null; i++) {
      const log = await publisher.evaluate(() => window.spikeLog);
      if (
        log.some((l) =>
          /connectionClosed|ice: (disconnected|failed|closed)/.test(l),
        )
      )
        closedAfterMs = Date.now() - t0;
      else await sleep(250);
    }
    await sleep(3000);
    return {
      deleteStatus: del.status,
      deleteBody: del.body,
      publisherClosedAfterMs: closedAfterMs,
      publisherLog: await publisher.evaluate(() => window.spikeLog),
      streamAfter: (
        await omeApi('GET', `/vhosts/default/apps/app/streams/${s1}`)
      ).status,
      viewerAfter: await viewers[0].evaluate(() => window.snapshot()),
    };
  });

  await check('reconnect-after-end-rejected', async () => {
    const r = await tryPublish(
      await openPublisher(),
      whipUrl(s1, await tokenFor(s1)),
    );
    const events = await eventsFor(s1);
    return {
      publish: r,
      webhook: events,
      closingEvents: events.filter((e) => e.status === 'closing').length,
    };
  });

  await check('fail-closed-slow-webhook', async () => {
    const s = `sl${run}`;
    await hook('/delay', { ms: 6000 });
    const r = await tryPublish(
      await openPublisher(),
      whipUrl(s, await tokenFor(s)),
      20000,
    );
    await hook('/delay', { ms: 0 });
    return { publish: r, webhook: await eventsFor(s) };
  });

  await check('control-after-slow', async () => {
    const s = `c1${run}`;
    return {
      publish: await tryPublish(
        await openPublisher(),
        whipUrl(s, await tokenFor(s)),
      ),
    };
  });

  await check('fail-closed-webhook-down', async () => {
    const s = `dn${run}`;
    const token = await tokenFor(s);
    await stopWebhook();
    const r = await tryPublish(await openPublisher(), whipUrl(s, token), 20000);
    await startWebhook();
    return { publish: r };
  });

  await check('control-after-restart', async () => {
    const s = `c2${run}`;
    return {
      publish: await tryPublish(
        await openPublisher(),
        whipUrl(s, await tokenFor(s)),
      ),
    };
  });

  // Splits the single-publisher CPU between the Opus->AAC transcode and everything else.
  await check('cpu-attribution', async () => {
    const sample = async () => {
      await sleep(6000);
      const out = [];
      for (let i = 0; i < 3; i++) out.push(dockerCpu());
      return out;
    };
    const closeAll = async () => {
      for (const p of context.pages()) await p.close();
    };
    await closeAll();
    const noStreams = await sample();
    const sv = `av${run}`;
    await tryPublish(
      await openPublisher(),
      whipUrl(sv, await tokenFor(sv)),
      15000,
      {},
      false,
    );
    const videoOnly = await sample();
    await closeAll();
    const sa = `aa${run}`;
    await tryPublish(await openPublisher(), whipUrl(sa, await tokenFor(sa)));
    const audioAndVideo = await sample();
    await closeAll();
    return { noStreams, videoOnly, audioAndVideo };
  });

  // What viewers get if a browser ends up sending VP8 instead of H.264 (PRD §7.2 risk).
  await check('vp8-publish', async () => {
    const s = `vp${run}`;
    const page = await openPublisher();
    const r = await tryPublish(page, whipUrl(s, await tokenFor(s)), 15000, {
      preferredVideoFormat: 'VP8',
    });
    await sleep(3000);
    const outbound = r.ok
      ? await page.evaluate(() => window.outboundStats())
      : null;
    const info = await omeApi('GET', `/vhosts/default/apps/app/streams/${s}`);
    let playlist = null;
    for (let i = 0; i < 30 && !playlist; i++) {
      const res = await fetch(`${OME}/app/${s}/llhls.m3u8`);
      if (res.status === 200) playlist = (await res.text()).slice(0, 600);
      else await sleep(500);
    }
    return {
      publish: r,
      sentVideoCodec: outbound?.out.find((o) => o.kind === 'video')?.mimeType,
      outputs: info.body?.response?.outputs?.map((o) =>
        o.tracks?.map(
          (t) =>
            `${t.type}:${t.video?.codec ?? t.audio?.codec ?? ''}:bypass=${t.video?.bypass ?? t.audio?.bypass}`,
        ),
      ),
      playlist,
    };
  });
}

await browser.close();
await stopWebhook();
staticServer.close();
writeFileSync(join(OUT, 'ome.log'), dockerLogs(`--since=${results.startedAt}`));
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
say(`results written to ${OUT}`);
