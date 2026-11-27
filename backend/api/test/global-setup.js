// Brings the test database to the latest schema, empties it, and loads career content.
const { execSync } = require('node:child_process');
const { join } = require('node:path');

module.exports = async () => {
  require('./env');
  const cwd = join(__dirname, '..');
  const env = { ...process.env };
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const tables = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
  await prisma.$disconnect();

  execSync('npx nest build', { cwd, env, stdio: 'pipe' });
  execSync('node dist/content/load-content.js', { cwd, env, stdio: 'pipe' });
};
