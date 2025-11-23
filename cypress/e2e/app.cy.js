describe("GlitchList UI smoke tests", () => {
  beforeEach(() => {
    // Visit base URL; Cypress will use baseUrl from config if set, otherwise absolute URL
    cy.visit("http://localhost:5173/");
  });

  it("should show the app title", () => {
    cy.get("h1").contains("GlitchList v0.1").should("be.visible");
  });

  it("should allow typing into the new task input", () => {
    cy.get('input[placeholder="Nova tarefa..."]')
      .should("be.visible")
      .type("Tarefa via Cypress")
      .should("have.value", "Tarefa via Cypress");
  });

  it("should show an initial task from the API", () => {
    // This relies on the backend running on :3001 and the client fetching tasks
    cy.contains("Testar aplicação").should("exist");
  });

  it('Visible Text in Buttons', function() {});

  it('shoud delete task', function() {
    cy.get('#root li:nth-child(1) button.rounded').click();
    cy.get('#root button.w-full').click();
    cy.get('#root li:nth-child(2)').click();
  });
});

it('should delete task', function() {});
