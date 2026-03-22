import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const sourcePath = path.resolve(process.cwd(), 'prisma/schema.prisma');
  const targetPath = path.resolve(
    process.cwd(),
    '../../../final_project/schema.prisma',
  );

  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);

  console.log('Synced Prisma schema:');
  console.log(`- Source: ${sourcePath}`);
  console.log(`- Target: ${targetPath}`);
}

void main().catch((error) => {
  console.error('Failed to sync Prisma schema:', error);
  process.exit(1);
});
