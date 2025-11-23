// @ts-check
import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3001";

// ==========================================
// TESTES FUNCIONAIS (Frontend + Mock)
// ==========================================
test.describe("Funcionalidades da GlitchList", () => {
  // Mock da API antes de cada teste
  test.beforeEach(async ({ page }) => {
    await page.route("http://localhost:3001/tasks", async (route) => {
      const method = route.request().method();

      if (method === "GET") {
        await route.fulfill({
          json: {
            data: [
              { id: 1, title: "Comprar leite", completed: 0 },
              { id: 2, title: "Estudar Playwright", completed: 1 },
            ],
          },
        });
      } else if (method === "POST") {
        // Simula criação e retorna sucesso
        await route.fulfill({
          json: { id: 3, title: "Nova Tarefa", completed: 0 },
        });
      }
    });

    await page.route("http://localhost:3001/tasks/*", async (route) => {
      const method = route.request().method();
      if (method === "DELETE" || method === "PUT") {
        await route.fulfill({ json: { success: true } });
      }
    });

    await page.goto("/");
  });

  test("deve exibir a lista de tarefas inicial", async ({ page }) => {
    await expect(page.getByText("Comprar leite")).toBeVisible();
    await expect(page.getByText("Estudar Playwright")).toBeVisible();
  });

  test("deve adicionar uma nova tarefa", async ({ page }) => {
    const input = page.getByPlaceholder("Nova tarefa...");
    await input.fill("Nova Tarefa de Teste");

    // Intercepta a requisição POST para garantir que foi chamada
    const requestPromise = page.waitForRequest(
      (request) =>
        request.url() === "http://localhost:3001/tasks" &&
        request.method() === "POST"
    );

    await page.getByRole("button", { name: "Adicionar" }).click();

    const request = await requestPromise;
    expect(request.postDataJSON()).toEqual({ title: "Nova Tarefa de Teste" });
  });

  test("deve filtrar tarefas concluídas", async ({ page }) => {
    // Clica no filtro "Concluídos"
    await page.getByRole("button", { name: "Concluídos" }).click();

    // Deve mostrar a tarefa concluída (id 2) e esconder a pendente (id 1)
    // Nota: Devido ao BUG 14 no código, este teste pode falhar ou passar dependendo do comportamento invertido
    await expect(page.getByText("Estudar Playwright")).toBeVisible();
    await expect(page.getByText("Comprar leite")).toBeHidden();
  });

  test("deve filtrar tarefas pendentes", async ({ page }) => {
    // Clica no filtro "Pendentes"
    await page.getByRole("button", { name: "Pendentes" }).click();

    // Deve mostrar a tarefa pendente (id 1) e esconder a concluída (id 2)
    await expect(page.getByText("Comprar leite")).toBeVisible();
    await expect(page.getByText("Estudar Playwright")).toBeHidden();
  });

  test("deve deletar uma tarefa", async ({ page }) => {
    // Vamos deletar a primeira tarefa
    const taskItem = page.locator("li").filter({ hasText: "Comprar leite" });

    // Intercepta DELETE
    const deletePromise = page.waitForRequest(
      (request) =>
        request.url().includes("/tasks/1") && request.method() === "DELETE"
    );

    await taskItem.getByRole("button", { name: "Deletar" }).click();

    await deletePromise;

    // Verifica se sumiu da tela
    await expect(page.getByText("Comprar leite")).toBeHidden();
  });

  test("deve alternar o status da tarefa ao clicar", async ({ page }) => {
    const taskText = page.getByText("Comprar leite");

    // Intercepta PUT
    const putPromise = page.waitForRequest(
      (request) =>
        request.url().includes("/tasks/1") && request.method() === "PUT"
    );

    await taskText.click();

    const request = await putPromise;
    // Verifica se enviou o status invertido (era 0, deve enviar true/1)
    expect(request.postDataJSON()).toEqual({ completed: true });
  });
});

// ==========================================
// TESTES DE API E SEGURANÇA (Backend Real)
// ==========================================
test.describe("Testes de API e Segurança do Backend", () => {
  test("GET /tasks - Deve listar tarefas e expor informações sensíveis (BUG 4)", async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/tasks`);

    // Verifica se a API respondeu
    expect(response.ok(), "A API deve responder com sucesso").toBeTruthy();

    const body = await response.json();
    expect(body.message).toBe("success");
    expect(Array.isArray(body.data)).toBeTruthy();

    // BUG 4: Verificando o vazamento de informações da infraestrutura
    expect(body).toHaveProperty("db_info");
    console.log("⚠️ ALERTA DE SEGURANÇA: Info do DB vazada:", body.db_info);
  });

  test("POST /tasks - Deve permitir SQL Injection (BUG 6)", async ({
    request,
  }) => {
    // BUG 6: O código usa interpolação de string direta: VALUES ('${title}', 0)
    // Vamos injetar um comando que fecha a string e comenta o resto
    const maliciousTitle = "Teste'); DROP TABLE tasks; --";

    // Nota: O driver do SQLite pode não executar múltiplos statements por padrão em db.run,
    // mas a vulnerabilidade de injeção existe. Vamos testar se ele aceita a string quebrada.

    const response = await request.post(`${BASE_URL}/tasks`, {
      data: { title: maliciousTitle },
    });

    // Se o servidor retornar 200, significa que ele tentou processar a query injetada
    expect(response.status()).toBe(200);

    // Vamos verificar se conseguimos inserir algo que altera a lógica
    // Injetando: ' || (SELECT 'hacked') || '
    // Query final: VALUES ('' || (SELECT 'hacked') || '', 0) -> Título vira 'hacked'
    const logicInjection = "' || 'hacked' || '";

    await request.post(`${BASE_URL}/tasks`, {
      data: { title: logicInjection },
    });

    const listRes = await request.get(`${BASE_URL}/tasks`);
    const tasks = (await listRes.json()).data;

    // Se a injeção funcionou, pode haver uma task com nome estranho ou o banco pode ter quebrado
    console.log("Tasks após injeção:", tasks);
  });

  test("PUT /tasks/:id - Deve atualizar TODAS as tarefas devido a falta de WHERE (BUG 8)", async ({
    request,
  }) => {
    // 1. Limpar estado (reiniciando banco seria ideal, mas vamos criar novos)
    // Como não temos delete real, vamos criar tasks com nomes únicos
    const id1 = Date.now();
    const id2 = id1 + 1;

    await request.post(`${BASE_URL}/tasks`, {
      data: { title: `Task A ${id1}` },
    });
    await request.post(`${BASE_URL}/tasks`, {
      data: { title: `Task B ${id2}` },
    });

    // Buscar IDs reais
    const listRes = await request.get(`${BASE_URL}/tasks`);
    const tasks = (await listRes.json()).data;
    const taskA = tasks.find(
      (/** @type {{ title: string; id: any; }} */ t) =>
        t.title === `Task A ${id1}`
    );
    const taskB = tasks.find(
      (/** @type {{ title: string; id: any; }} */ t) =>
        t.title === `Task B ${id2}`
    );

    if (!taskA || !taskB) {
      console.log("Falha ao preparar dados de teste");
      return;
    }

    // 2. Atualizar APENAS a Task A para completed = 1
    await request.put(`${BASE_URL}/tasks/${taskA.id}`, {
      data: { completed: 1 },
    });

    // 3. Verificar se Task B TAMBÉM foi atualizada (o bug)
    const listResAfter = await request.get(`${BASE_URL}/tasks`);
    const tasksAfter = (await listResAfter.json()).data;

    const taskBAfter = tasksAfter.find(
      (/** @type {any} */ t) => t.id === taskB.id
    );

    // O comportamento esperado DO BUG é que taskB.completed seja 1, mesmo não tendo sido alvo do update
    expect(
      taskBAfter.completed,
      "BUG CONFIRMADO: Atualizou tarefa errada!"
    ).toBe(1);
  });

  test("DELETE /tasks/:id - Não deve deletar nada (BUG 9)", async ({
    request,
  }) => {
    // 1. Criar tarefa
    const title = `To Delete ${Date.now()}`;
    const createRes = await request.post(`${BASE_URL}/tasks`, {
      data: { title },
    });
    const createdId = (await createRes.json()).id;

    // 2. Tentar deletar
    const deleteRes = await request.delete(`${BASE_URL}/tasks/${createdId}`);
    expect(deleteRes.ok()).toBeTruthy();

    // 3. Verificar se ainda existe
    const listRes = await request.get(`${BASE_URL}/tasks`);
    const tasks = (await listRes.json()).data;
    const stillExists = tasks.find(
      (/** @type {any} */ t) => t.id === createdId
    );

    expect(
      stillExists,
      "BUG CONFIRMADO: A tarefa não foi deletada!"
    ).toBeDefined();
  });

  test("POST /tasks - Falta de Validação de Input (BUG 5)", async ({
    request,
  }) => {
    // Enviar título vazio
    const resEmpty = await request.post(`${BASE_URL}/tasks`, {
      data: { title: "" },
    });
    expect(resEmpty.status()).toBe(200); // Deveria ser 400, mas o bug permite 200

    // Enviar payload gigante
    const hugeString = "a".repeat(10000);
    const resHuge = await request.post(`${BASE_URL}/tasks`, {
      data: { title: hugeString },
    });
    expect(resHuge.status()).toBe(200);
  });
});

// ==========================================
// TESTES DE UI/UX (Visual)
// ==========================================
test.describe("Testes de UI/UX e Visual", () => {
  test.beforeEach(async ({ page }) => {
    // Mock para carregar a página sem depender do backend real
    await page.route("http://localhost:3001/tasks", async (route) => {
      await route.fulfill({
        json: { data: [{ id: 1, title: "Tarefa Visual", completed: 0 }] },
      });
    });
    await page.goto("/");
  });

  test("BUG 15: Verifica baixo contraste (Texto claro em fundo claro)", async ({
    page,
  }) => {
    // O container principal tem text-gray-300 (muito claro)
    const container = page.locator(".min-h-screen");

    const color = await container.evaluate((el) => {
      return window.getComputedStyle(el).color;
    });

    console.log("Cor do texto detectada:", color);

    // rgb(209, 213, 219) é o cinza claro do Tailwind (gray-300)
    // Isso confirma que o texto é quase invisível contra o fundo branco/cinza
    expect(color).toBe("rgb(209, 213, 219)");
  });

  test("BUG 17: Verifica semântica de cor incorreta no botão Deletar (Verde)", async ({
    page,
  }) => {
    const deleteBtn = page.getByRole("button", { name: "Deletar" });

    const bgColor = await deleteBtn.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    console.log("Cor do botão Deletar:", bgColor);

    // rgb(34, 197, 94) é o verde do Tailwind (green-500)
    // Um botão destrutivo deveria ser vermelho
    expect(bgColor).toBe("rgb(34, 197, 94)");
  });

  test("BUG 16: Verifica alinhamento estranho do título", async ({ page }) => {
    const title = page.getByRole("heading", { name: "GlitchList v0.1" });

    const textAlign = await title.evaluate((el) => {
      return window.getComputedStyle(el).textAlign;
    });

    // O título está alinhado à direita, o que é estranho para esse layout
    expect(textAlign).toBe("right");
  });
});
