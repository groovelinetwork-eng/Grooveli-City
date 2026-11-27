/** End-to-end tests: real Nest app, real Postgres (TEST_DATABASE_URL), real S3 and SMTP from docker-compose. */
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/test/tsconfig.json' }] },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/global-setup.js',
  setupFiles: ['<rootDir>/test/env.js'],
  testTimeout: 30000,
  maxWorkers: 1,
};
