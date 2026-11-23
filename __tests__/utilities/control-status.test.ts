jest.mock('../../lib/control-lifecycle', () => ({
  inspectControlCrypto: jest.fn(),
}));
jest.mock('../../lib/control-secure-store', () => ({
  loadControlGrant: jest.fn(),
}));

import { inspectControlCrypto } from '../../lib/control-lifecycle';
import { loadControlGrant } from '../../lib/control-secure-store';
import { getControlConnectionStatus } from '../../lib/control-status';

const inspect = inspectControlCrypto as jest.Mock;
const load = loadControlGrant as jest.Mock;

describe('local control security status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    inspect.mockResolvedValue({ available: true, reason: 'available' });
    load.mockResolvedValue(null);
  });
  it('does not report active access without pairing', async () => {
    expect(await getControlConnectionStatus(1000)).toMatchObject({
      paired: false, active: false, scopes: [],
    });
  });
  it('reports scoped unexpired approval but never secrets', async () => {
    load.mockResolvedValue({
      pairingId: 'pair-1', scopes: ['status:read'],
      expiresAt: new Date(2000).toISOString(), revoked: false,
    });
    const status = await getControlConnectionStatus(1000);
    expect(status.active).toBe(true);
    expect(status.scopes).toEqual(['status:read']);
    expect(JSON.stringify(status)).not.toContain('pair-1');
  });
  it('rejects expired revoked and crypto-unavailable approvals', async () => {
    load.mockResolvedValue({
      pairingId: 'pair-1', scopes: ['status:read'],
      expiresAt: new Date(1000).toISOString(), revoked: false,
    });
    expect((await getControlConnectionStatus(1000)).active).toBe(false);
    load.mockResolvedValue({
      pairingId: 'pair-1', scopes: ['status:read'],
      expiresAt: new Date(2000).toISOString(), revoked: true,
    });
    expect((await getControlConnectionStatus(1000)).active).toBe(false);
    inspect.mockResolvedValue({ available: false, reason: 'webcrypto-unavailable' });
    expect((await getControlConnectionStatus(1000)).active).toBe(false);
  });
});
