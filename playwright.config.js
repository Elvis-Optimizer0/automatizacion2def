module.exports = {
  testDir: './tests',
  timeout: 120000,
  expect: {
    timeout: 10000
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  globalSetup: require.resolve('./tests/e2e/global-setup.cjs'),
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'unit',
      testMatch: '**/unit/**/*.test.js',
      use: { ...require('@playwright/test').devices['Desktop Chrome'] }
    },
    {
      name: 'e2e',
      testMatch: '**/e2e/**/*.spec.js',
      use: { ...require('@playwright/test').devices['Desktop Chrome'] }
    }
  ]
};