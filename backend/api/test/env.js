// Test environment. Uses a separate database so tests never touch development data.
const { join } = require('node:path');
try {
  process.loadEnvFile(join(__dirname, '..', '.env'));
} catch {
  /* CI provides variables directly */
}
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://grooveli:grooveli@localhost:5440/grooveli_test?schema=public';
process.env.S3_BUCKET = process.env.TEST_S3_BUCKET ?? 'grooveli-test-files';
process.env.PASSWORD_BREACH_CHECK = 'false';
process.env.SWAGGER_ENABLED = 'false';
process.env.CONTENT_BLOCKLIST = 'forbiddenword';
process.env.MARKETS_PROVIDER = 'open-er-api';
delete process.env.ANTHROPIC_API_KEY;
