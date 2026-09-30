import { createApp as realApp } from '../../server/index.js';
import { WindowsCredentials, credentialError } from '../../server/credentials.js';
// Browser regression servers must never touch the real Windows credential set.
export const createApp = options => realApp({ dev: true, windowsSpeechImpl: { voices: async () => [], synthesize: async () => { throw Error('Windows audio disabled in browser fixtures'); } }, ...options, credentials: new WindowsCredentials({ bridge: async action => {
  if (action === 'status') return { ok: true, saved: false };
  throw credentialError('UNAVAILABLE');
} }) });
