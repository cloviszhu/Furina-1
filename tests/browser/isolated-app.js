import { createApp as realApp } from '../../server/index.js';
import { WindowsCredentials, credentialError } from '../../server/credentials.js';
// Browser regression servers must never touch the real Windows credential set.
export const createApp = options => realApp({ ...options, credentials: new WindowsCredentials({ bridge: async action => {
  if (action === 'status') return { ok: true, saved: false };
  throw credentialError('UNAVAILABLE');
} }) });
