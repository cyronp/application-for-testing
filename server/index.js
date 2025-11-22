const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = 3001;

// BUG 1: Configuração de CORS permissiva demais (Segurança)
app.use(cors()); 
app.use(bodyParser.json());

// Setup do Banco de Dados
const db = new sqlite3.Database(':memory:'); // BUG 2: Dados não persistem ao reiniciar (Volatilidade)

db.serialize(() => {
  db.run("CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, completed INTEGER)");
  // Inserindo dados iniciais
  db.run("INSERT INTO tasks (title, completed) VALUES ('Testar aplicação', 0)");
});

// Rota GET - Listar Tarefas
app.get('/tasks', (req, res) => {
  // BUG 3: Ordenação aleatória (UX/Consistência)
  // A cada refresh, a lista pode mudar de ordem, dificultando testes de UI
  db.all("SELECT * FROM tasks ORDER BY RANDOM()", [], (err, rows) => {
    if (err) {
      res.status(400).json({ "error": err.message });
      return;
    }
    // BUG 4: Expondo estrutura interna do DB no JSON (Segurança)
    res.json({
      message: "success",
      data: rows,
      db_info: "sqlite3_memory_v1" 
    });
  });
});

// Rota POST - Criar Tarefa
app.post('/tasks', (req, res) => {
  const { title } = req.body;
  
  // BUG 5: Falta validação de input (Qualidade de Dados)
  // Permite tarefas vazias ou strings gigantes
  
  // BUG 6: SQL Injection Clássico (Segurança Crítica)
  // Se o usuário enviar "'); DROP TABLE tasks; --", o banco quebra.
  const sql = `INSERT INTO tasks (title, completed) VALUES ('${title}', 0)`;
  
  db.run(sql, function(err) {
    if (err) {
      // BUG 7: Retorna 200 OK mesmo com erro de servidor (Padrão HTTP incorreto)
      res.status(200).json({ error: "Erro ao salvar", details: err.message });
      return;
    }
    res.json({
      message: "success",
      id: this.lastID
    });
  });
});

// Rota PUT - Atualizar Status
app.put('/tasks/:id', (req, res) => {
  const { completed } = req.body;
  
  // BUG 8: Erro de Lógica Grave (Algoritmo)
  // O filtro WHERE está faltando na query SQL abaixo.
  // Isso vai atualizar TODAS as tarefas do banco para o mesmo status.
  const sql = `UPDATE tasks SET completed = ?`; 
  
  db.run(sql, [completed], function(err) {
    if (err) {
      res.status(400).json({ error: res.message });
      return;
    }
    res.json({ message: "updated", changes: this.changes });
  });
});

// Rota DELETE - Deletar Tarefa
app.delete('/tasks/:id', (req, res) => {
    // BUG 9: Endpoint 'Hardcoded' silencioso (Lógica)
    // O endpoint diz que deletou, mas não executa a query no banco.
    console.log(`Fingindo que deletei o ID ${req.params.id}`);
    res.json({ message: "deleted", rows: 1 }); 
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});