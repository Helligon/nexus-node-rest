// Regenerates oracle/golden-probe.json. Review the diff before committing.
import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { runProbe } from '../checks/probe.js';
import { createGoldenServer } from '../oracle/golden-server.js';

const server = createGoldenServer(() => undefined);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const records = await runProbe(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
server.close();
writeFileSync(fileURLToPath(new URL('../oracle/golden-probe.json', import.meta.url)), `${JSON.stringify(records, null, 2)}\n`);
