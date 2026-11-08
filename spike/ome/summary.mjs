// Prints one evidence line per issue #2 criterion from out/*/results.json. PASS/FAIL is about the evidence, not the OME decision.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
const load = (m) =>
  existsSync(join(out, m, 'results.json'))
    ? JSON.parse(readFileSync(join(out, m, 'results.json'))).checks
    : {};
const full = load('full');
const probe = load('ice-probe');
const image = existsSync(join(out, 'image.txt'))
  ? readFileSync(join(out, 'image.txt'), 'utf8')
  : '';

const pb = full['playback-3-viewers'];
const info = full['ome-stream-info'];
const pub = full['publish-with-token'];
const sentVideo = pub?.outbound?.out?.find((o) => o.kind === 'video');
const outTracks = info?.outputs?.[0]?.tracks ?? [];
const videoOut = outTracks.find((t) => t.type === 'Video');
const rejected = (c) => c?.publish && !c.publish.ok;

const rows = [
  [
    '1 playback video+audio',
    pb?.second?.every(
      (s, i) =>
        s.videoWidth > 0 &&
        s.currentTime > pb.first[i].currentTime &&
        s.audioDecodedBytes > pb.first[i].audioDecodedBytes,
    ) && pb?.audio?.every((a) => a.peakRms > 0.01),
    pb &&
      `viewers=${pb.second.length} size=${pb.second[0].videoWidth}x${pb.second[0].videoHeight} tracks=${JSON.stringify(pb.second[0].tracks)} peakRms=${pb.audio.map((a) => a.peakRms.toFixed(3))} hlsLatency=${pb.second.map((s) => s.hlsLatency?.toFixed(2))}s`,
  ],
  [
    '2 H.264, no video transcode',
    sentVideo?.mimeType === 'video/H264' &&
      videoOut?.codec === 'H264' &&
      videoOut?.bypass === true,
    `sent=${sentVideo?.mimeType} (${sentVideo?.encoderImplementation}) omeOut=${outTracks.map((t) => `${t.type}:${t.codec}:bypass=${t.bypass}`).join(',')} cpu idle=${full['idle-cpu']?.samples?.[0]} 1pub=${pub?.cpu1Pub0View?.[0]} 1pub+3view=${pb?.cpuDuring1Pub3View?.join(' | ')}`,
  ],
  [
    '3 webhook rejects missing/bad token, allows valid',
    rejected(full['reject-no-token']) &&
      rejected(full['reject-bad-token']) &&
      pub?.publish?.ok &&
      [full['reject-no-token'], full['reject-bad-token'], pub].every((c) =>
        c.webhook?.some((e) => e.signatureValid),
      ),
    `noToken=${full['reject-no-token']?.publish?.outcome} badToken=${full['reject-bad-token']?.publish?.outcome} valid=${pub?.publish?.outcome} forgedSig=${full['reject-forged-signature']?.status} realSigVerified=${pub?.webhook?.filter((e) => e.signatureValid).length}`,
  ],
  [
    '4 DELETE ends publish, reconnect rejected',
    full['force-end']?.deleteStatus === 200 &&
      full['force-end']?.publisherClosedAfterMs != null &&
      full['force-end']?.streamAfter === 404 &&
      rejected(full['reconnect-after-end-rejected']),
    `DELETE=${full['force-end']?.deleteStatus} publisherClosedAfter=${full['force-end']?.publisherClosedAfterMs}ms streamAfter=${full['force-end']?.streamAfter} reconnect=${full['reconnect-after-end-rejected']?.publish?.outcome} closingEvents=${full['reconnect-after-end-rejected']?.closingEvents}`,
  ],
  [
    '5 arm64 image',
    /arch=arm64/.test(image) && /container uname -m: aarch64/.test(image),
    image.trim().replace(/\n/g, ' ; '),
  ],
  [
    'extra: fail-closed (slow / down webhook)',
    rejected(full['fail-closed-slow-webhook']) &&
      rejected(full['fail-closed-webhook-down']) &&
      full['control-after-slow']?.publish?.ok &&
      full['control-after-restart']?.publish?.ok,
    `slow=${full['fail-closed-slow-webhook']?.publish?.outcome} after ${full['fail-closed-slow-webhook']?.publish?.elapsedMs}ms, down=${full['fail-closed-webhook-down']?.publish?.outcome}, controls=${full['control-after-slow']?.publish?.ok}/${full['control-after-restart']?.publish?.ok}`,
  ],
  [
    'extra: ICE probe OME_HOST_IP=*',
    probe['ice-probe']?.ok,
    `outcome=${probe['ice-probe']?.outcome} answerCandidates=${JSON.stringify(
      probe['ice-probe']?.answerCandidates?.map((l) =>
        l
          .split(' ')
          .slice(2, 6)
          .join(' ')
          .replace(
            /\b(?!(?:127|10|172|192)\.)\d+\.\d+\.\d+\.\d+\b/g,
            '<public-ip>',
          ),
      ),
    )}`,
  ],
  [
    'extra: VP8 publish',
    null,
    `sent=${full['vp8-publish']?.sentVideoCodec} playlistCodecs=${full['vp8-publish']?.playlist?.match(/CODECS="([^"]+)"/)?.[1]}`,
  ],
];

for (const [name, ok, evidence] of rows) {
  console.log(
    `${ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL'}  ${name}\n      ${evidence}`,
  );
}
