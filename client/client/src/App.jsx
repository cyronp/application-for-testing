import { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [filter, setFilter] = useState('all'); // 'all', 'completed', 'pending'

  useEffect(() => {
    fetchTasks();
  }, []); // BUG 10: Falta dependência. Se algo mudar externamente, não atualiza.

  const fetchTasks = async () => {
    try {
      const response = await axios.get('http://localhost:3001/tasks');
      // BUG 11: O backend retorna { data: [...] }, mas aqui acessamos errado se a estrutura mudar
      setTasks(response.data.data);
    } catch (error) {
      console.error("Erro", error);
    }
  };

  const handleAddTask = async (e) => {
    // BUG 12: Falta o e.preventDefault()
    // Isso fará a página recarregar toda vez que submeter o form, perdendo o estado (SPA quebra).
    
    await axios.post('http://localhost:3001/tasks', { title: newTask });
    setNewTask('');
    fetchTasks();
  };

  const toggleTask = async (id, currentStatus) => {
    // Lógica frontend ok, mas vai acionar o BUG 8 do backend
    await axios.put(`http://localhost:3001/tasks/${id}`, { completed: !currentStatus });
    fetchTasks();
  };

  const deleteTask = async (id) => {
    await axios.delete(`http://localhost:3001/tasks/${id}`);
    // BUG 13: Atualização Otimista Falsa
    // A UI remove o item, mas como o backend (BUG 9) não deleta, ao dar F5 o item volta.
    setTasks(tasks.filter(t => t.id !== id));
  };

  // BUG 14: Lógica de filtragem invertida (Algoritmo)
  const filteredTasks = tasks.filter(task => {
    if (filter === 'completed') return task.completed === 0; // Mostra os pendentes quando pede completos
    if (filter === 'pending') return task.completed === 1;   // Mostra os completos quando pede pendentes
    return true;
  });

  return (
    // BUG 15: Contraste Baixo / Acessibilidade (Visual)
    // Texto cinza claro em fundo branco é ilegível.
    <div className="min-h-screen bg-gray-100 p-8 text-gray-300">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-2xl p-6">
        
        {/* BUG 16: Erro de Layout (Visual) */}
        {/* Título desalinhado e com fonte Comic Sans propositalmente feia */}
        <h1 className="text-3xl font-bold mb-4 text-right font-mono text-red-500">
          GlitchList v0.1
        </h1>

        <form className="mb-4">
          <input
            type="text"
            className="border p-2 w-full text-black"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Nova tarefa..."
          />
          <button
            onClick={handleAddTask}
            className="mt-2 bg-blue-500 text-white p-2 rounded w-full hover:bg-blue-700"
          >
            Adicionar
          </button>
        </form>

        <div className="flex justify-between mb-4 text-black">
          <button onClick={() => setFilter('all')}>Todos</button>
          <button onClick={() => setFilter('completed')}>Concluídos</button>
          <button onClick={() => setFilter('pending')}>Pendentes</button>
        </div>

        <ul>
          {filteredTasks.map((task) => (
            <li key={task.id} className="flex justify-between items-center border-b py-2">
              <span 
                className={`flex-1 text-black ${task.completed ? 'line-through' : ''}`}
                onClick={() => toggleTask(task.id, task.completed)}
              >
                {task.title}
              </span>
              
              {/* BUG 17: Semântica de Cores (Visual/UX) */}
              {/* Botão de deletar é VERDE (confunde com confirmar) */}
              <button
                onClick={() => deleteTask(task.id)}
                className="bg-green-500 text-white px-2 py-1 rounded text-xs"
              >
                Deletar
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default App;