import { ThemeManager } from './theme.js';
import apisRequest from './api.js';

class BoardDetailsManager {
    constructor() {
        this.boardId = new URLSearchParams(window.location.search).get('id');
        this.boardContainer = document.getElementById('board-container');
        this.boardTitle = document.getElementById('board-title');
        this.backBtn = document.getElementById('back-btn');
        this.addColumnBtn = document.getElementById('add-column-btn');
        this.themeToggle = document.getElementById('theme-toggle');
        
        // Cache para colunas e tarefas
        this.columnsCache = new Map();
        this.tasksCache = new Map();
        
        if (!this.boardId) {
            window.location.href = 'board.html';
            return;
        }

        ThemeManager.init(); // Inicializa o tema
        this.init();
    }

    async init() {
        this.setupEventListeners();
        // Carrega board e colunas em paralelo
        await Promise.all([
            this.loadBoardDetails(),
            this.loadColumns()
        ]);
    }

    setupEventListeners() {
        this.backBtn.addEventListener('click', () => window.location.href = 'board.html');
        this.addColumnBtn.addEventListener('click', () => this.showAddColumnModal());
        this.themeToggle.addEventListener('click', () => ThemeManager.toggle());
    }

    async loadBoardDetails() {
        try {
            const board = await apisRequest.GetBoardById(this.boardId);
            this.boardTitle.textContent = board.Name;
            document.body.style.backgroundColor = board.HexaBackgroundColor || '#ffffff';
        } catch (error) {
            console.error('Erro ao carregar detalhes do quadro:', error);
            this.showError('Erro ao carregar detalhes do quadro');
        }
    }

    async loadColumns() {
        try {
            const loadingPlaceholder = this.createLoadingPlaceholder();
            this.boardContainer.innerHTML = '';
            this.boardContainer.appendChild(loadingPlaceholder);

            // Carrega colunas
            const columns = await apisRequest.ColumnsBoardId(this.boardId);
            this.columnsCache.clear();
            
            // Remove placeholder e renderiza colunas
            this.boardContainer.innerHTML = '';
            
            // Tenta carregar todas as tarefas de uma vez
            let tasksByColumn = {};
            try {
                const allTasks = await apisRequest.TasksByBoardId(this.boardId);
                if (Array.isArray(allTasks)) {
                    tasksByColumn = allTasks.reduce((acc, task) => {
                        if (!acc[task.ColumnId]) {
                            acc[task.ColumnId] = [];
                        }
                        acc[task.ColumnId].push(task);
                        return acc;
                    }, {});
                }
            } catch (error) {
                console.warn('Erro ao carregar todas as tarefas, carregando individualmente:', error);
                // Se falhar, carregará as tarefas por coluna individualmente
                tasksByColumn = await this.loadTasksByColumns(columns);
            }

            // Renderiza todas as colunas
            for (const column of columns) {
                const columnElement = this.createColumnElement(column, tasksByColumn[column.Id] || []);
                this.boardContainer.appendChild(columnElement);
                this.columnsCache.set(column.Id, column);
            }

        } catch (error) {
            console.error('Erro ao carregar colunas:', error);
            this.showError('Erro ao carregar colunas');
            // Mesmo com erro, limpa o loading
            this.boardContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Erro ao carregar as colunas. Tente novamente.</p>
                    <button onclick="window.location.reload()" class="btn btn-primary">
                        <i class="fas fa-sync"></i> Recarregar
                    </button>
                </div>
            `;
        }
    }

    createLoadingPlaceholder() {
        const placeholder = document.createElement('div');
        placeholder.classList.add('loading-placeholder');
        placeholder.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Carregando colunas...</span>
            </div>
        `;
        return placeholder;
    }

    createColumnElement(column, tasks = []) {
        const columnDiv = document.createElement('div');
        columnDiv.classList.add('column');
        columnDiv.innerHTML = `
            <div class="column-header">
                <h3 class="column-title">${column.Name}</h3>
                <div class="column-actions">
                    <button class="btn-icon edit-column" title="Editar coluna">
                        <img src="icons/edit.svg" alt="Editar">
                    </button>
                    <button class="btn-icon delete-column" title="Excluir coluna">
                        <img src="icons/trash.svg" alt="Excluir">
                    </button>
                </div>
            </div>
            <div class="tasks-container" data-column-id="${column.Id}">
                ${tasks.map(task => this.createTaskHTML(task)).join('')}
            </div>
            <div class="add-task-btn">
                <img src="icons/add.svg" alt="Adicionar">
                Adicionar Tarefa
            </div>
        `;

        // Configurar eventos
        this.setupColumnEvents(columnDiv, column);
        
        // Configurar eventos das tarefas
        tasks.forEach(task => {
            const taskElement = columnDiv.querySelector(`[data-task-id="${task.Id}"]`);
            if (taskElement) {
                this.setupTaskEvents(taskElement, task);
            }
        });

        return columnDiv;
    }

    createTaskHTML(task) {
        const completedClass = task.IsCompleted ? 'completed' : '';
        const statusIcon = task.IsCompleted ? 'check.svg' : 'circle.svg';
        
        return `
            <div class="task-card ${completedClass}" data-task-id="${task.Id}" data-priority="${task.Priority}" draggable="true">
                <div class="task-status">
                    <img src="icons/${statusIcon}" alt="Status">
                </div>
                <div class="task-content">
                    <div class="task-title">${task.Title}</div>
                    <div class="task-description">${task.Description || ''}</div>
                </div>
            </div>
        `;
    }

    setupColumnEvents(columnElement, column) {
        const addTaskBtn = columnElement.querySelector('.add-task-btn');
        addTaskBtn.addEventListener('click', () => this.showAddTaskModal(column.Id));

        const editBtn = columnElement.querySelector('.edit-column');
        editBtn.addEventListener('click', () => this.showEditColumnModal(column));

        const deleteBtn = columnElement.querySelector('.delete-column');
        deleteBtn.addEventListener('click', () => this.deleteColumn(column.Id));
    }

    setupTaskEvents(taskElement, task) {
        taskElement.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', task.Id);
            taskElement.classList.add('dragging');
        });

        taskElement.addEventListener('dragend', () => {
            taskElement.classList.remove('dragging');
        });

        // Adiciona evento de clique no ícone de status
        const statusIcon = taskElement.querySelector('.task-status');
        if (statusIcon) {
            statusIcon.addEventListener('click', async (e) => {
                e.stopPropagation(); // Evita que abra o modal de edição
                await this.toggleTaskCompletion(task, taskElement);
            });
        }

        // Mantém o evento de edição no clique do card
        taskElement.addEventListener('click', (e) => {
            if (!e.target.closest('.task-status')) {
                this.showEditTaskModal(task);
            }
        });
    }

    showError(message) {
        alert(message); // Implementar um sistema de notificação mais elegante
    }

    showAddTaskModal(columnId) {
        const modal = document.createElement('div');
        modal.classList.add('modal', 'flex-centralize');
        modal.style.animation = 'modalSlideUp 0.3s var(--elastic) forwards';

        const form = document.createElement('form');
        form.classList.add('modal-content', 'card', 'card-primary');
        form.innerHTML = `
            <h2 class="fnt-lg">Nova Tarefa</h2>
            <input type="text" id="taskTitle" class="input-primary w-full p-sm border-md" 
                placeholder="Título da tarefa" required>
            <textarea id="taskDescription" class="input-primary w-full p-sm border-md" 
                placeholder="Descrição da tarefa" rows="3"></textarea>
            <div class="form-group">
                <label for="taskPriority">Prioridade:</label>
                <select id="taskPriority" class="input-primary w-full p-sm border-md">
                    <option value="1">Baixa</option>
                    <option value="2">Média</option>
                    <option value="3">Alta</option>
                </select>
            </div>
            <div class="flex-row gap-sm w-full">
                <button type="submit" class="btn btn-primary w-full p-sm border-md">Criar</button>
                <button type="button" class="btn btn-secondary w-full p-sm border-md">Cancelar</button>
            </div>
        `;

        modal.appendChild(form);
        document.body.appendChild(modal);

        const closeModal = () => {
            modal.style.animation = 'modalSlideDown 0.3s var(--elastic) forwards';
            setTimeout(() => modal.remove(), 300);
        };

        form.querySelector('.btn-secondary').onclick = closeModal;

        form.onsubmit = async (e) => {
            e.preventDefault();
            const userId = localStorage.getItem('userId');
            
            const newTask = {
                Title: form.querySelector('#taskTitle').value,
                Description: form.querySelector('#taskDescription').value,
                Priority: parseInt(form.querySelector('#taskPriority').value),
                ColumnId: columnId,
                IsActive: true,
                CreatedBy: parseInt(userId),
                UpdatedBy: parseInt(userId)
            };

            try {
                await this.createTask(newTask);
                closeModal();
                await this.loadColumns(); // Recarrega as colunas para mostrar a nova tarefa
            } catch (error) {
                this.showError('Erro ao criar tarefa');
                console.error('Erro ao criar tarefa:', error);
            }
        };
    }

    async createTask(task) {
        try {
            await apisRequest.AddTask(task);
            this.showSuccess('Tarefa criada com sucesso!');
        } catch (error) {
            throw error;
        }
    }

    showEditTaskModal(task) {
        const modal = document.createElement('div');
        modal.classList.add('modal', 'flex-centralize');
        modal.style.animation = 'modalSlideUp 0.3s var(--elastic) forwards';

        const form = document.createElement('form');
        form.classList.add('modal-content', 'card', 'card-primary');
        form.innerHTML = `
            <h2 class="fnt-lg">Editar Tarefa</h2>
            <div class="task-completion-status">
                <label class="checkbox-container">
                    <input type="checkbox" id="taskCompleted" ${task.IsCompleted ? 'checked' : ''}>
                    <span class="checkmark"></span>
                    Tarefa concluída
                </label>
            </div>
            <input type="text" id="taskTitle" class="input-primary w-full p-sm border-md" 
                value="${task.Title}" placeholder="Título da tarefa" required>
            <textarea id="taskDescription" class="input-primary w-full p-sm border-md" 
                placeholder="Descrição da tarefa" rows="3">${task.Description || ''}</textarea>
            <div class="form-group">
                <label for="taskPriority">Prioridade:</label>
                <select id="taskPriority" class="input-primary w-full p-sm border-md">
                    <option value="1" ${task.Priority === 1 ? 'selected' : ''}>Baixa</option>
                    <option value="2" ${task.Priority === 2 ? 'selected' : ''}>Média</option>
                    <option value="3" ${task.Priority === 3 ? 'selected' : ''}>Alta</option>
                </select>
            </div>
            <div class="flex-row gap-sm w-full">
                <button type="submit" class="btn btn-primary w-full p-sm border-md">Salvar</button>
                <button type="button" class="btn btn-secondary w-full p-sm border-md">Cancelar</button>
                <button type="button" class="btn btn-danger w-full p-sm border-md">Excluir</button>
            </div>
        `;

        modal.appendChild(form);
        document.body.appendChild(modal);

        const closeModal = () => {
            modal.style.animation = 'modalSlideDown 0.3s var(--elastic) forwards';
            setTimeout(() => modal.remove(), 300);
        };

        form.querySelector('.btn-secondary').onclick = closeModal;
        form.querySelector('.btn-danger').onclick = async () => {
            if (confirm('Tem certeza que deseja excluir esta tarefa?')) {
                try {
                    await this.deleteTask(task.Id);
                    closeModal();
                    await this.loadColumns();
                } catch (error) {
                    this.showError('Erro ao excluir tarefa');
                }
            }
        };

        form.onsubmit = async (e) => {
            e.preventDefault();
            const userId = localStorage.getItem('userId');
            
            const updatedTask = {
                ...task,
                Title: form.querySelector('#taskTitle').value,
                Description: form.querySelector('#taskDescription').value,
                Priority: parseInt(form.querySelector('#taskPriority').value),
                IsCompleted: form.querySelector('#taskCompleted').checked,
                UpdatedBy: parseInt(userId)
            };

            try {
                await this.updateTask(updatedTask);
                closeModal();
                await this.loadColumns();
            } catch (error) {
                this.showError('Erro ao atualizar tarefa');
                console.error('Erro ao atualizar tarefa:', error);
            }
        };
    }

    async updateTask(task) {
        try {
            await apisRequest.UpdateTask(task);
            this.showSuccess('Tarefa atualizada com sucesso!');
        } catch (error) {
            throw error;
        }
    }

    async deleteTask(taskId) {
        try {
            await apisRequest.RemoveTask(taskId);
            this.showSuccess('Tarefa excluída com sucesso!');
        } catch (error) {
            throw error;
        }
    }

    showSuccess(message) {
        // Implementação temporária
        alert(message);
    }

    // Novo método para carregar tarefas por coluna individualmente
    async loadTasksByColumns(columns) {
        const tasksByColumn = {};
        
        await Promise.all(columns.map(async column => {
            try {
                const tasks = await apisRequest.TasksColumnId(column.Id);
                if (Array.isArray(tasks)) {
                    tasksByColumn[column.Id] = tasks;
                }
            } catch (error) {
                console.warn(`Erro ao carregar tarefas da coluna ${column.Id}:`, error);
                tasksByColumn[column.Id] = [];
            }
        }));

        return tasksByColumn;
    }

    async showAddColumnModal() {
        const modal = document.createElement('div');
        modal.classList.add('modal', 'flex-centralize');
        modal.style.animation = 'modalSlideUp 0.3s var(--elastic) forwards';

        const form = document.createElement('form');
        form.classList.add('modal-content', 'card', 'card-primary');
        form.innerHTML = `
            <h2 class="fnt-lg">Nova Coluna</h2>
            <input type="text" id="columnName" class="input-primary w-full p-sm border-md" 
                placeholder="Nome da coluna" required>
            <div class="flex-row gap-sm w-full">
                <button type="submit" class="btn btn-primary w-full p-sm border-md">Criar</button>
                <button type="button" class="btn btn-secondary w-full p-sm border-md">Cancelar</button>
            </div>
        `;

        modal.appendChild(form);
        document.body.appendChild(modal);

        const closeModal = () => {
            modal.style.animation = 'modalSlideDown 0.3s var(--elastic) forwards';
            setTimeout(() => modal.remove(), 300);
        };

        form.querySelector('.btn-secondary').onclick = closeModal;

        form.onsubmit = async (e) => {
            e.preventDefault();
            const userId = localStorage.getItem('userId');
            
            const newColumn = {
                Name: form.querySelector('#columnName').value,
                BoardId: parseInt(this.boardId),
                IsActive: true,
                CreatedBy: parseInt(userId),
                UpdatedBy: parseInt(userId)
            };

            try {
                await apisRequest.CreateColumn(newColumn);
                this.showSuccess('Coluna criada com sucesso!');
                closeModal();
                await this.loadColumns();
            } catch (error) {
                console.error('Erro ao criar coluna:', error);
                this.showError('Erro ao criar coluna');
            }
        };
    }

    async showEditColumnModal(column) {
        const modal = document.createElement('div');
        modal.classList.add('modal', 'flex-centralize');
        modal.style.animation = 'modalSlideUp 0.3s var(--elastic) forwards';

        const form = document.createElement('form');
        form.classList.add('modal-content', 'card', 'card-primary');
        form.innerHTML = `
            <h2 class="fnt-lg">Editar Coluna</h2>
            <input type="text" id="columnName" class="input-primary w-full p-sm border-md" 
                value="${column.Name}" placeholder="Nome da coluna" required>
            <div class="flex-row gap-sm w-full">
                <button type="submit" class="btn btn-primary w-full p-sm border-md">Salvar</button>
                <button type="button" class="btn btn-secondary w-full p-sm border-md">Cancelar</button>
            </div>
        `;

        modal.appendChild(form);
        document.body.appendChild(modal);

        const closeModal = () => {
            modal.style.animation = 'modalSlideDown 0.3s var(--elastic) forwards';
            setTimeout(() => modal.remove(), 300);
        };

        form.querySelector('.btn-secondary').onclick = closeModal;

        form.onsubmit = async (e) => {
            e.preventDefault();
            const userId = localStorage.getItem('userId');
            
            const updatedColumn = {
                ...column,
                Name: form.querySelector('#columnName').value,
                UpdatedBy: parseInt(userId)
            };

            try {
                await apisRequest.UpdateColumn(updatedColumn);
                this.showSuccess('Coluna atualizada com sucesso!');
                closeModal();
                await this.loadColumns();
            } catch (error) {
                console.error('Erro ao atualizar coluna:', error);
                this.showError('Erro ao atualizar coluna');
            }
        };
    }

    async deleteColumn(columnId) {
        if (!confirm('Tem certeza que deseja excluir esta coluna? Todas as tarefas serão excluídas também.')) {
            return;
        }

        try {
            await apisRequest.RemoveColumn(columnId);
            this.showSuccess('Coluna excluída com sucesso!');
            await this.loadColumns();
        } catch (error) {
            console.error('Erro ao excluir coluna:', error);
            this.showError('Erro ao excluir coluna');
        }
    }

    async toggleTaskCompletion(task, taskElement) {
        try {
            const updatedTask = {
                ...task,
                IsCompleted: !task.IsCompleted,
                UpdatedBy: parseInt(localStorage.getItem('userId'))
            };

            await apisRequest.UpdateTask(updatedTask);
            
            // Atualiza a UI
            taskElement.classList.toggle('completed');
            const statusIcon = taskElement.querySelector('.task-status i');
            if (statusIcon) {
                statusIcon.classList.toggle('fa-circle');
                statusIcon.classList.toggle('fa-check-circle');
            }

            // Atualiza o objeto da task no cache
            task.IsCompleted = updatedTask.IsCompleted;
            
            this.showSuccess(task.IsCompleted ? 'Tarefa concluída!' : 'Tarefa reaberta!');
        } catch (error) {
            console.error('Erro ao atualizar status da tarefa:', error);
            this.showError('Erro ao atualizar status da tarefa');
        }
    }
}

// Inicializar
new BoardDetailsManager(); 