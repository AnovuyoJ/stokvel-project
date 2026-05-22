module.exports = {
  testEnvironment: "node",

  testMatch: [
    "**/__tests__/**/*.js",
    "**/?(*.)+(spec|test).js"
  ],

  collectCoverageFrom: [
    "**/*.js",
    "!**/node_modules/**",
    // Add these exclusions below
    "!**/tests/**",
    "!**/__tests__/**",
    "!**/*.test.js",
    "!**/*.spec.js",
    "!**/coverage/**",
    "!**/config/**",
    "!**/migrations/**",
    "!**/seeds/**",
  ],

  // Generate coverage reports
  collectCoverage: true,

  // Folder where coverage files will be stored
  coverageDirectory: "coverage",

  // Generate HTML report + terminal text report
  coverageReporters: ["html", "text"],

  // Optional: open this file in browser after running tests
  // coverage/lcov-report/index.html
};