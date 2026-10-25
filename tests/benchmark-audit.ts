import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readAuditTail } from '../server/resources';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zenflow-benchmark-'));
const file = path.join(directory, 'audit.jsonl');
try {
  const block = Array.from({ length: 1000 }, (_, id) => JSON.stringify({ id, timestamp: '2026-10-25T00:00:00Z', details: 'x'.repeat(400) })).join('\n') + '\n';
  for (let i = 0; i < 100; i++) fs.appendFileSync(file, block);
  const baseline: number[] = [], bounded: number[] = [];
  for (let i = 0; i < 5; i++) {
    global.gc?.();
    let start = performance.now();
    const expected = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).slice(-100).reverse().map(line => JSON.parse(line));
    baseline.push(performance.now() - start);
    start = performance.now();
    const actual = await readAuditTail(file);
    bounded.push(performance.now() - start);
    assert.deepEqual(actual, expected);
  }
  const median = (times: number[]) => times.sort((a, b) => a - b)[2];
  console.log(JSON.stringify({ runtime: process.version, fileBytes: fs.statSync(file).size, records: 100000, baselineMedianMs: median(baseline), boundedMedianMs: median(bounded), reductionPercent: (1 - median(bounded) / median(baseline)) * 100, last100Identical: true }, null, 2));
} finally { fs.rmSync(directory, { recursive: true }); }
