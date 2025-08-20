const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');

const config = {
  entryPoints: [path.join(__dirname, 'src', 'extension.ts')],
  bundle: true,
  outfile: path.join(__dirname, 'out', 'extension.js'),
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'ES2020',
  sourcemap: true,
  minify: false,
};

if (isWatch) {
  esbuild.context(config).then((ctx) => {
    ctx.watch();
    console.log('Watching for changes...');
  });
} else {
  esbuild.build(config).catch(() => process.exit(1));
}