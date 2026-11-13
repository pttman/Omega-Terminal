import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' });
let desktop;
const stop = () => { desktop?.kill(); vite.kill(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (let attempt = 0; attempt < 80; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:5173');
    if (response.ok) {
      const env = { ...process.env, PERSON_DEV_URL: 'http://127.0.0.1:5173' };
      delete env.ELECTRON_RUN_AS_NODE;
      desktop = spawn(require('electron'), ['.'], { stdio: 'inherit', env });
      desktop.on('exit', code => { vite.kill(); process.exit(code ?? 0); });
      break;
    }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 250));
}
if (!desktop) { stop(); process.exitCode = 1; }
