import { run, type RunIO } from './run.js';

function blocksWantsStdin(argv: string[]): boolean {
  return argv.some(
    (arg, i) => arg === '--blocks=-' || (arg === '--blocks' && argv[i + 1] === '-'),
  );
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.from(chunk));
    });
    process.stdin.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    process.stdin.on('error', reject);
  });
}

(async () => {
  const argv = process.argv.slice(2);
  const io: RunIO = {
    stdout: (line: string) => process.stdout.write(line + '\n'),
    stderr: (line: string) => process.stderr.write(line + '\n'),
    env: process.env as Record<string, string | undefined>,
  };
  if (blocksWantsStdin(argv)) {
    io.stdin = await readStdin();
  }
  const code = await run(argv, io);
  process.exit(code);
})();
