// cypress/e2e/full.cy.js

// Testes combinados: API (backend) + UI (frontend)
// Requisitos: iniciar manualmente os servidores antes de rodar:
// - Backend: npm run dev --prefix server (http://localhost:3001)
// - Frontend: npm run dev --prefix client (http://localhost:5173)

describe("API Tests - Backend (segurança e funcionalidades)", () => {
  const api = "http://localhost:3001";

  it("GET /tasks deve retornar lista e expor db_info (BUG 4)", () => {
    cy.request({ method: "GET", url: `${api}/tasks` }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body).to.have.property("message", "success");
      expect(res.body).to.have.property("data").and.to.be.an("array");
      // Verifica vazamento de informação
      expect(res.body).to.have.property("db_info");
    });
  });

  it("POST /tasks aceita payloads e permite 'injeção' simples (BUG 6)", () => {
    const malicious = "Teste'); DROP TABLE tasks; --";
    cy.request({
      method: "POST",
      url: `${api}/tasks`,
      body: { title: malicious },
    }).then((res) => {
      // servidor retorna 200 mesmo em erro no back-end conforme bug observado
      expect(res.status).to.be.oneOf([200, 201]);
    });

    // tentar uma injeção lógica que pode criar título 'hacked'
    const logicInjection = "' || 'hacked' || '";
    cy.request({
      method: "POST",
      url: `${api}/tasks`,
      body: { title: logicInjection },
    })
      .then(() => cy.request({ method: "GET", url: `${api}/tasks` }))
      .then((listRes) => {
        const titles = listRes.body.data.map((t) => t.title);
        // Se vulnerável, pode conter 'hacked' ou strings estranhas
        expect(titles.join("|")).to.match(/hacked|\W{2,}/);
      });
  });

  it("PUT /tasks/:id atualiza TODAS as tarefas (BUG 8)", () => {
    // Criar duas tarefas
    cy.request("POST", `${api}/tasks`, { title: `Task A ${Date.now()}` }).then(
      (r1) => {
        cy.request("POST", `${api}/tasks`, {
          title: `Task B ${Date.now()}`,
        }).then((r2) => {
          // Obter lista e ids
          cy.request("GET", `${api}/tasks`).then((listRes) => {
            const tasks = listRes.body.data;
            const idA = tasks.find((t) => t.title.startsWith("Task A")).id;
            const idB = tasks.find((t) => t.title.startsWith("Task B")).id;
            // Atualizar apenas A
            cy.request("PUT", `${api}/tasks/${idA}`, { completed: 1 }).then(
              () => {
                cy.request("GET", `${api}/tasks`).then((after) => {
                  const tasksAfter = after.body.data;
                  const b = tasksAfter.find((t) => t.id === idB);
                  // BUG: B também foi atualizado
                  expect(b.completed).to.eq(1);
                });
              }
            );
          });
        });
      }
    );
  });

  it("DELETE /tasks/:id não efetivamente deleta (BUG 9)", () => {
    cy.request("POST", `${api}/tasks`, {
      title: `To Delete ${Date.now()}`,
    }).then((createRes) => {
      const createdId = createRes.body.id;
      cy.request("DELETE", `${api}/tasks/${createdId}`).then((delRes) => {
        expect(delRes.status).to.be.oneOf([200, 204]);
        // Verifica se ainda existe na lista
        cy.request("GET", `${api}/tasks`).then((listRes) => {
          const exists = listRes.body.data.find((t) => t.id === createdId);
          expect(exists).to.not.be.undefined; // bug: ainda existe
        });
      });
    });
  });

  it("POST /tasks aceita título vazio e muito grande (BUG 5)", () => {
    cy.request("POST", `${api}/tasks`, { title: "" }).then((r) => {
      expect(r.status).to.be.oneOf([200, 201]);
    });

    const huge = "a".repeat(10000);
    cy.request("POST", `${api}/tasks`, { title: huge }).then((r) => {
      expect(r.status).to.be.oneOf([200, 201]);
    });
  });
});

// UI Tests (frontend). Esses testes assumem frontend rodando em http://localhost:5173
// e backend em http://localhost:3001. Para isolar lado cliente, intercepts são usados
// quando indicado.

describe("UI Tests - Frontend", () => {
  beforeEach(() => {
    // não mockamos por padrão; a app faz fetch para /tasks
    cy.visit("/");
  });

  it("exibe título e input", () => {
    cy.get("h1").should("be.visible").and("contain.text", "GlitchList v0.1");
    cy.get('input[placeholder="Nova tarefa..."]').should("be.visible");
  });

  it("adiciona nova tarefa via UI", () => {
    const text = `Tarefa UI ${Date.now()}`;
    cy.get('input[placeholder="Nova tarefa..."]').clear().type(text);
    cy.get("button").contains("Adicionar").click();
    // após adicionar, a lista deve atualizar (depende do backend)
    cy.contains(text).should("exist");
  });

  it("alterna status ao clicar no texto da tarefa", () => {
    // pega primeira li e clica no texto
    cy.get("ul > li")
      .first()
      .within(() => {
        cy.get("span").first().click();
      });
    // Espera que a classe line-through seja aplicada (visual)
    cy.get("ul > li")
      .first()
      .within(() => {
        cy.get("span").should("have.class", "line-through");
      });
  });

  it("deleta tarefa via botão Deletar (UI) - atualização otimista falsa", () => {
    // cria uma task via API para garantir presença
    const t = `ToDeleteUI ${Date.now()}`;
    cy.request("POST", "/tasks", { title: t }).then(() => {
      cy.reload();
      cy.contains(t).should("exist");
      cy.contains(t)
        .parent()
        .within(() => {
          cy.get("button").contains("Deletar").click();
        });
      // deveria desaparecer da UI
      cy.contains(t).should("not.exist");
      // backend ainda a mantém (bug) - verificar via API
      cy.request("GET", "/tasks").then((r) => {
        const exists = r.body.data.find((x) => x.title === t);
        expect(exists).to.not.be.undefined;
      });
    });
  });

  it("verifica problemas de UI/UX: contraste, cor do botão Deletar e alinhamento do título", () => {
    // contraste: o container principal tem classe text-gray-300
    cy.get(".min-h-screen").then(($el) => {
      const color = window.getComputedStyle($el[0]).color;
      // gray-300 no Tailwind -> rgb(209, 213, 219)
      expect(color).to.equal("rgb(209, 213, 219)");
    });

    // botão deletar deve ser verde atualmente
    cy.get("button")
      .contains("Deletar")
      .then(($btn) => {
        const bg = window.getComputedStyle($btn[0]).backgroundColor;
        // green-500 -> rgb(34, 197, 94)
        expect(bg).to.equal("rgb(34, 197, 94)");
      });

    // título alinhado à direita
    cy.get("h1").then(($h) => {
      const ta = window.getComputedStyle($h[0]).textAlign;
      expect(ta).to.equal("right");
    });
  });
});
