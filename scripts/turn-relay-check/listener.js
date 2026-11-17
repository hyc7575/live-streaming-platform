// 더미 peer: TCP·UDP 5432에서 받은 바이트를 기록한다.
const net = require('net'),
  dgram = require('dgram');
net
  .createServer((s) => {
    console.log(`[tcp] connect from ${s.remoteAddress}:${s.remotePort}`);
    s.on('data', (d) =>
      console.log(`[tcp] ${d.length}B ${JSON.stringify(d.toString())}`),
    );
    s.on('error', () => {});
  })
  .listen(5432, () => console.log('tcp listening 5432'));
const u = dgram.createSocket('udp4');
u.on('message', (d, r) =>
  console.log(
    `[udp] ${d.length}B from ${r.address}:${r.port} ${JSON.stringify(d.toString())}`,
  ),
);
u.bind(5432, () => console.log('udp listening 5432'));
