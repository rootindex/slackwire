import { run } from './run.js';

(async () => {
  const argv = process.argv.slice(2);
  const code = await run(argv, {
    stdout: (line: string) => process.stdout.write(line + '\n'),
    stderr: (line: string) => process.stderr.write(line + '\n'),
    env: process.env as Record<string, string | undefined>,
  });
  process.exit(code);
})();
