const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    // baseUrl usado pelos testes (frontend)
    baseUrl: "http://localhost:5173",
    specPattern: "cypress/e2e/**/*.cy.js",
    supportFile: false,
    setupNodeEvents(on, config) {
      // implement node event listeners here
      return config;
    },
  },
});
