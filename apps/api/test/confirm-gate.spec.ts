import { describe, expect, it } from 'vitest';
import { ConfirmGate } from '../src/donations/confirm-gate.js';

// 손으로 끝내는 작업. 언제 시작했는지와 지금 몇 개가 도는지를 본다.
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('ConfirmGate', () => {
  it('runs one user’s work one at a time, in arrival order', async () => {
    const gate = new ConfirmGate(3);
    const started: number[] = [];
    const jobs = [deferred(), deferred(), deferred()];
    const runs = jobs.map((job, i) =>
      gate.run('u1', async () => {
        started.push(i);
        await job.promise;
        return i;
      }),
    );
    await tick();
    expect(started).toEqual([0]);
    jobs[0]?.resolve();
    await tick();
    expect(started).toEqual([0, 1]);
    jobs[1]?.resolve();
    jobs[2]?.resolve();
    expect(await Promise.all(runs)).toEqual([0, 1, 2]);
    expect(started).toEqual([0, 1, 2]);
  });

  it('caps how much work of different users runs at once', async () => {
    const gate = new ConfirmGate(2);
    let running = 0;
    let most = 0;
    const jobs = Array.from({ length: 5 }, () => deferred());
    const runs = jobs.map((job, i) =>
      gate.run(`u${i}`, async () => {
        running += 1;
        most = Math.max(most, running);
        await job.promise;
        running -= 1;
      }),
    );
    await tick();
    expect(running).toBe(2);
    for (const job of jobs) {
      job.resolve();
      await tick();
    }
    await Promise.all(runs);
    expect(most).toBe(2);
  });

  it('lets the next work in after a failure', async () => {
    const gate = new ConfirmGate(1);
    const failing = gate.run('u1', () => Promise.reject(new Error('Toss 502')));
    const sameUser = gate.run('u1', () => Promise.resolve('same'));
    const otherUser = gate.run('u2', () => Promise.resolve('other'));
    await expect(failing).rejects.toThrow('Toss 502');
    expect(await sameUser).toBe('same');
    expect(await otherUser).toBe('other');
    // 자리가 모두 돌아왔다: 새 작업이 바로 돈다.
    expect(await gate.run('u3', () => Promise.resolve('free'))).toBe('free');
  });

  it('lets the next work in after a synchronous throw', async () => {
    const gate = new ConfirmGate(1);
    const failing = gate.run('u1', () => {
      throw new Error('boom');
    });
    await expect(failing).rejects.toThrow('boom');
    expect(await gate.run('u1', () => Promise.resolve('next'))).toBe('next');
  });
});
