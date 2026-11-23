import { runPairingMutation } from '../../lib/control-pairing-mutex';

describe('pairing lifecycle serialization', () => {
  it('does not begin a second mutation until the first finishes', async () => {
    const events: string[] = [];
    let release!: () => void;
    const first = runPairingMutation(async () => {
      events.push('first-start');
      await new Promise<void>(resolve => { release = resolve; });
      events.push('first-end');
    });
    const second = runPairingMutation(async () => { events.push('second'); });
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(['first-start']);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(['first-start', 'first-end', 'second']);
  });

  it('continues processing after a rejected mutation', async () => {
    await expect(runPairingMutation(async () => {
      throw new Error('locked');
    })).rejects.toThrow('locked');
    await expect(runPairingMutation(async () => 'ready')).resolves.toBe('ready');
  });
});
