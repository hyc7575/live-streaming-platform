// 최소 TURN-over-TCP 클라이언트. 더미 peer(listener)로 중계를 시도하고 응답을 기록한다.
const net = require('net'),
  crypto = require('crypto'),
  dns = require('dns').promises;
const [host, port, peerHost, user = 'ome', pass = 'airen'] =
  process.argv.slice(2);
const MAGIC = 0x2112a442;
const T = {
  ALLOCATE: 0x003,
  CREATE_PERM: 0x008,
  CHANNEL_BIND: 0x009,
  SEND_IND: 0x016,
  CONNECT: 0x00a,
  REFRESH: 0x004,
};
const A = {
  USERNAME: 0x0006,
  MI: 0x0008,
  ERROR: 0x0009,
  CHANNEL: 0x000c,
  PEER: 0x0012,
  DATA: 0x0013,
  REALM: 0x0014,
  NONCE: 0x0015,
  RELAYED: 0x0016,
  REQ_TRANSPORT: 0x0019,
  XOR_MAPPED: 0x0020,
  CONN_ID: 0x002a,
};
const pad = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
function attr(t, v) {
  const h = Buffer.alloc(4);
  h.writeUInt16BE(t);
  h.writeUInt16BE(v.length, 2);
  return pad(Buffer.concat([h, v]));
}
function xorAddr(ip, p) {
  const b = Buffer.alloc(8);
  b[1] = 1;
  b.writeUInt16BE(p ^ (MAGIC >>> 16), 2);
  const o = ip.split('.').map(Number);
  const x = Buffer.from(o);
  for (let i = 0; i < 4; i++)
    b[4 + i] = x[i] ^ ((MAGIC >>> (24 - 8 * i)) & 0xff);
  return b;
}
function parseXor(v) {
  const p = v.readUInt16BE(2) ^ (MAGIC >>> 16);
  const ip = [0, 1, 2, 3]
    .map((i) => v[4 + i] ^ ((MAGIC >>> (24 - 8 * i)) & 0xff))
    .join('.');
  return `${ip}:${p}`;
}
function build(type, attrs, auth) {
  const tid = crypto.randomBytes(12);
  let body = Buffer.concat(attrs);
  const hdr = (len) => {
    const h = Buffer.alloc(20);
    h.writeUInt16BE(type);
    h.writeUInt16BE(len, 2);
    h.writeUInt32BE(MAGIC, 4);
    tid.copy(h, 8);
    return h;
  };
  if (auth) {
    const pre = Buffer.concat([hdr(body.length + 24), body]);
    const mi = crypto.createHmac('sha1', auth.key).update(pre).digest();
    body = Buffer.concat([body, attr(A.MI, mi)]);
  }
  return Buffer.concat([hdr(body.length), body]);
}
function parse(b) {
  const type = b.readUInt16BE(0);
  const len = b.readUInt16BE(2);
  const attrs = {};
  let o = 20;
  while (o < 20 + len) {
    const t = b.readUInt16BE(o),
      l = b.readUInt16BE(o + 2);
    attrs[t] = b.subarray(o + 4, o + 4 + l);
    o += 4 + l + ((4 - (l % 4)) % 4);
  }
  return { type, attrs };
}
function describe(m) {
  const cls = ((m.type & 0x0100) >> 7) | ((m.type & 0x0010) >> 4);
  const names = ['request', 'indication', 'success', 'error'];
  let s = `type=0x${m.type.toString(16).padStart(4, '0')} (${names[cls]})`;
  if (m.attrs[A.ERROR]) {
    const e = m.attrs[A.ERROR];
    s += ` error=${e[2] * 100 + e[3]} ${e.subarray(4).toString()}`;
  }
  if (m.attrs[A.RELAYED]) s += ` relayed=${parseXor(m.attrs[A.RELAYED])}`;
  if (m.attrs[A.XOR_MAPPED]) s += ` mapped=${parseXor(m.attrs[A.XOR_MAPPED])}`;
  if (m.attrs[A.CONN_ID]) s += ` connId=${m.attrs[A.CONN_ID].toString('hex')}`;
  return s;
}
class Conn {
  constructor(label) {
    this.label = label;
    this.buf = Buffer.alloc(0);
    this.waiters = [];
    this.closed = false;
  }
  open() {
    return new Promise((res, rej) => {
      this.s = net.connect(+port, host, res);
      this.s.on('error', (e) => {
        console.log(`${this.label} socket error ${e.message}`);
        rej(e);
      });
      this.s.on('close', () => {
        this.closed = true;
        console.log(`${this.label} socket closed by server`);
        this.waiters.splice(0).forEach((w) => w(null));
      });
      this.s.on('data', (d) => {
        this.buf = Buffer.concat([this.buf, d]);
        this.drain();
      });
    });
  }
  drain() {
    while (this.buf.length >= 4) {
      const first = this.buf[0];
      if (first >= 0x40 && first <= 0x7f) {
        const l = this.buf.readUInt16BE(2);
        const tot = 4 + l + ((4 - (l % 4)) % 4);
        if (this.buf.length < tot) return;
        console.log(`${this.label} <- ChannelData ${l}B`);
        this.buf = this.buf.subarray(tot);
        continue;
      }
      if (this.buf.length < 20) return;
      const l = this.buf.readUInt16BE(2);
      if (this.buf.length < 20 + l) return;
      const m = parse(this.buf.subarray(0, 20 + l));
      this.buf = this.buf.subarray(20 + l);
      const w = this.waiters.shift();
      if (w) w(m);
      else console.log(`${this.label} <- unsolicited ${describe(m)}`);
    }
  }
  req(name, msg) {
    return new Promise((res) => {
      const t = setTimeout(() => {
        console.log(`${this.label} ${name}: no response (3s)`);
        res(null);
      }, 3000);
      this.waiters.push((m) => {
        clearTimeout(t);
        if (m) console.log(`${this.label} ${name}: ${describe(m)}`);
        res(m);
      });
      if (!this.closed) this.s.write(msg);
    });
  }
  send(raw) {
    if (!this.closed) this.s.write(raw);
  }
}
async function allocate(c, transport) {
  const rt = Buffer.from([transport, 0, 0, 0]);
  const r1 = await c.req(
    `Allocate(proto=${transport}, no auth)`,
    build(T.ALLOCATE, [attr(A.REQ_TRANSPORT, rt)]),
  );
  if (!r1) return null;
  const realm = r1.attrs[A.REALM],
    nonce = r1.attrs[A.NONCE];
  if (!realm) return { auth: null, ok: (r1.type & 0x0110) === 0x0100 };
  console.log(`${c.label} realm=${realm} nonce=${nonce?.toString()}`);
  const key = crypto
    .createHash('md5')
    .update(`${user}:${realm}:${pass}`)
    .digest();
  const auth = {
    key,
    a: [
      attr(A.USERNAME, Buffer.from(user)),
      attr(A.REALM, realm),
      attr(A.NONCE, nonce),
    ],
  };
  const r2 = await c.req(
    `Allocate(proto=${transport}, ${user}/${pass})`,
    build(T.ALLOCATE, [attr(A.REQ_TRANSPORT, rt), ...auth.a], auth),
  );
  return { auth, ok: r2 && (r2.type & 0x0110) === 0x0100 };
}
(async () => {
  const peerIp = (await dns.lookup(peerHost)).address;
  const peer = xorAddr(peerIp, 5432);
  console.log(`TURN ${host}:${port} peer ${peerHost}=${peerIp}:5432`);
  // 1) UDP 할당: CreatePermission → Send indication → ChannelBind → ChannelData
  const c = new Conn('[udp-alloc]');
  await c.open();
  const al = await allocate(c, 17);
  const auth = al?.auth;
  const withAuth = (t, attrs) =>
    auth ? build(t, [...attrs, ...auth.a], auth) : build(t, attrs);
  await c.req(
    'CreatePermission',
    withAuth(T.CREATE_PERM, [attr(A.PEER, peer)]),
  );
  c.send(
    build(T.SEND_IND, [
      attr(A.PEER, peer),
      attr(A.DATA, Buffer.from('TURN-SEND-INDICATION-216')),
    ]),
  );
  console.log('[udp-alloc] -> Send indication sent');
  const ch = Buffer.from([0x40, 0x00, 0, 0]);
  await c.req(
    'ChannelBind(0x4000)',
    withAuth(T.CHANNEL_BIND, [attr(A.CHANNEL, ch), attr(A.PEER, peer)]),
  );
  const payload = Buffer.from('TURN-CHANNELDATA-216');
  const cdh = Buffer.alloc(4);
  cdh.writeUInt16BE(0x4000);
  cdh.writeUInt16BE(payload.length, 2);
  c.send(pad(Buffer.concat([cdh, payload])));
  console.log('[udp-alloc] -> ChannelData sent');
  await new Promise((r) => setTimeout(r, 1500));
  c.s.destroy();
  // 2) TCP 할당(RFC 6062): Connect
  const d = new Conn('[tcp-alloc]');
  await d.open();
  const al2 = await allocate(d, 6);
  const auth2 = al2?.auth;
  const m = auth2
    ? build(T.CONNECT, [attr(A.PEER, peer), ...auth2.a], auth2)
    : build(T.CONNECT, [attr(A.PEER, peer)]);
  await d.req('Connect(RFC 6062)', m);
  await new Promise((r) => setTimeout(r, 1500));
  d.s.destroy();
  console.log('done');
})().catch((e) => {
  console.error('client error', e.message);
  process.exit(1);
});
