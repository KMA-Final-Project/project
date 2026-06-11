import { resolve } from 'node:path';

import { exportChapter3BenchmarkPackage } from './e2e-youtube-benchmark/chapter3-export';

const repoRoot = resolve(__dirname, '..', '..', '..');
const defaultOutDir = resolve(repoRoot, 'docs', 'experiments');

type CliOptions = {
  runDir: string;
  outDir: string;
  manualReviewLimit: number;
  command: string | null;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    runDir: '',
    outDir: defaultOutDir,
    manualReviewLimit: 5,
    command: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    switch (current) {
      case '--run-dir': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error('Missing value for --run-dir');
        }
        options.runDir = resolve(value);
        index += 1;
        break;
      }
      case '--out-dir': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error('Missing value for --out-dir');
        }
        options.outDir = resolve(value);
        index += 1;
        break;
      }
      case '--manual-review-limit': {
        const value = Number.parseInt(argv[index + 1] ?? '', 10);
        if (!Number.isInteger(value) || value < 0) {
          throw new Error('Invalid value for --manual-review-limit');
        }
        options.manualReviewLimit = value;
        index += 1;
        break;
      }
      case '--command': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error('Missing value for --command');
        }
        options.command = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${current}`);
    }
  }

  if (!options.runDir) {
    throw new Error('--run-dir is required');
  }

  return options;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const outputs = exportChapter3BenchmarkPackage({
    runDir: options.runDir,
    outDir: options.outDir,
    manualReviewLimit: options.manualReviewLimit,
    command: options.command,
  });

  console.log('Chapter 3 benchmark package written:');
  console.log(`- ${outputs.resultsJsonPath}`);
  console.log(`- ${outputs.casesCsvPath}`);
  console.log(`- ${outputs.performanceCsvPath}`);
  console.log(`- ${outputs.policyCsvPath}`);
  console.log(`- ${outputs.artifactCsvPath}`);
  console.log(`- ${outputs.qualityCsvPath}`);
  console.log(`- ${outputs.manualReviewCsvPath}`);
  console.log(`- ${outputs.reportMarkdownPath}`);
  console.log(`- ${outputs.evidenceIndexPath}`);
}

try {
  main();
} catch (error) {
  console.error('export-chapter3-benchmark failed');
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exitCode = 1;
}
