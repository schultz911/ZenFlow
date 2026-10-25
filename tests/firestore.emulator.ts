import path from 'node:path';
import { createRequire } from 'node:module';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

// Use the current Google Cloud gRPC transport to exercise the real emulator rules engine.
const project = 'demo-zenflow';
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Local Firestore emulator required');
const environment = await initializeTestEnvironment({ projectId: project, firestore: { rules: await fs.readFile('firestore.rules', 'utf8') } });
const require = createRequire(import.meta.url);
const grpc = require('@grpc/grpc-js');
const loader = require('@grpc/proto-loader');
const definition = loader.fromJSON(require(path.resolve(path.dirname(require.resolve('@google-cloud/firestore')), '../protos/v1.json')), { keepCase: true });
const api = grpc.loadPackageDefinition(definition).google.firestore.v1;
const client = new api.Firestore(host, grpc.credentials.createInsecure());
const root = `projects/${project}/databases/(default)/documents`;
const mockToken = (uid: string, email: string) => [
  Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: uid, user_id: uid, aud: project, iss: `https://securetoken.google.com/${project}`, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, email, email_verified: true })).toString('base64url'), '',
].join('.');
const request = async (document: string, token: string, method = 'GET', fields?: any) => {
  const metadata = new grpc.Metadata();
  if (token) metadata.set('authorization', `Bearer ${token}`);
  let rpc = 'getDocument', data: any = { name: `${root}/${document}` };
  if (method === 'DELETE') rpc = 'deleteDocument';
  else if (method === 'PATCH') { rpc = 'updateDocument'; data = { document: { name: `${root}/${document}`, fields } }; }
  else if (!document.includes('/')) { rpc = 'listDocuments'; data = { parent: root, collectionId: document }; }
  return new Promise<{status: number; text: () => Promise<string>}>(resolve => client[rpc](data, metadata, { deadline: Date.now() + 10000 }, (error: any) => {
    resolve({ status: error ? (error.code === 7 ? 403 : 500) : 200, text: async () => error?.message || 'ok' });
  }));
};
try {
  for (const name of ['users', 'tasks', 'compliance_audit_logs', 'server_secrets']) {
    const response = await request(`${name}/fixture`, 'owner', 'PATCH', { id: { stringValue: 'fixture' }, title: { stringValue: 'Fixture' } });
    assert.equal(response.status, 200, await response.text());
  }
  let denied = 0;
  for (const token of ['', mockToken('owner-id', 'owner@example.invalid'), mockToken('other', 'kiran.s@zensciences.com')]) {
    for (const name of ['users', 'tasks', 'compliance_audit_logs', 'server_secrets']) {
      for (const [document, method, fields] of [
        [name, 'GET', undefined], [`${name}/fixture`, 'GET', undefined],
        [`${name}/new`, 'PATCH', { isCreativeDirector: { booleanValue: true } }],
        [`${name}/fixture`, 'PATCH', { userId: { stringValue: 'other' }, title: { stringValue: 'x'.repeat(100000) } }],
        [`${name}/fixture`, 'DELETE', undefined],
      ] as const) {
        const response = await request(document, token, method, fields);
        assert.equal(response.status, 403, `${method} ${document}: ${await response.text()}`); denied++;
      }
    }
    const nested = await request('users/fixture/private/token', token, 'PATCH', { secret: { stringValue: 'forged' } });
    assert.equal(nested.status, 403); denied++;
  }
  console.log(`Firestore emulator: ${denied} unauthorized operations denied; Admin seed writes succeeded.`);
} finally { client.close(); await environment.cleanup(); }
