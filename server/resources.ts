import fs from 'node:fs';

export const MAX_SSE_BUFFER_BYTES = 256 * 1024;
export function writeSse(res: { destroyed: boolean; writableEnded: boolean; writableLength: number; write: (chunk: string) => boolean; destroy: () => unknown }, message: string): boolean {
  if (res.destroyed || res.writableEnded) return false;
  // One event may exceed the threshold; destroy immediately rather than retaining it.
  if (res.writableLength > 0 && res.writableLength + Buffer.byteLength(message) > MAX_SSE_BUFFER_BYTES) {
    res.destroy();
    return false;
  }
  try { res.write(message); return true; } catch { res.destroy(); return false; }
}

// Read the last N nonblank physical lines, then parse; invalid JSON still consumes a slot,
// matching the legacy reader. Decode only after reassembling bytes across UTF-8 boundaries.
export async function readAuditTail<T>(file: string, limit = 100): Promise<T[]> {
  let handle: fs.promises.FileHandle;
  try { handle = await fs.promises.open(file, 'r'); } catch (error: any) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  try {
    let position = (await handle.stat()).size;
    let fragments: Buffer[] = [];
    const lines: string[] = [];
    let trimmingEnd = true;
    const addLine = (raw: string) => {
      const line = trimmingEnd ? raw.trimEnd() : raw;
      if (!line) return;
      trimmingEnd = false;
      lines.push(line);
    };
    while (position > 0 && lines.length < limit) {
      const length = Math.min(position, 64 * 1024);
      position -= length;
      const block = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(block, 0, length, position);
      let end = bytesRead;
      for (let i = bytesRead - 1; i >= 0 && lines.length < limit; i--) {
        if (block[i] === 10) {
          const prefix = block.subarray(i + 1, end);
          const line = (fragments.length ? Buffer.concat([prefix, ...fragments.reverse()]) : prefix).toString('utf8');
          fragments = [];
          addLine(line);
          end = i;
        }
      }
      if (end > 0) fragments.push(block.subarray(0, end));
    }
    if (position === 0 && lines.length < limit && fragments.length) addLine(Buffer.concat(fragments.reverse()).toString('utf8').trimStart());
    const result: T[] = [];
    for (const line of lines.slice(0, limit)) {
      try { result.push(JSON.parse(line)); } catch { /* Preserve malformed-line tolerance. */ }
    }
    return result;
  } finally { await handle.close(); }
}
