<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  todoistToken: String,
  tmdbApiKey: String,
  corsProxy: String
})

const emit = defineEmits(['save', 'close'])

const localTodoistToken = ref(props.todoistToken)
const localTmdbApiKey = ref(props.tmdbApiKey)
const localCorsProxy = ref(props.corsProxy)

function save() {
  emit('save', {
    todoistToken: localTodoistToken.value,
    tmdbApiKey: localTmdbApiKey.value,
    corsProxy: localCorsProxy.value
  })
}

// Handle escape key
function handleKeydown(e) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal">
        <div class="modal-header">
          <h2>Настройки</h2>
          <button class="close-btn" @click="emit('close')">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">
              Todoist API Token
              <span class="required">*</span>
            </label>
            <input
              type="password"
              v-model="localTodoistToken"
              class="form-input"
              placeholder="Введите ваш Todoist API token"
            />
            <p class="form-hint">
              Получите токен в
              <a href="https://todoist.com/prefs/integrations" target="_blank" rel="noopener">
                настройках Todoist → Integrations → Developer
              </a>
            </p>
          </div>

          <div class="form-group">
            <label class="form-label">
              TMDB API Key
              <span class="optional">(необязательно)</span>
            </label>
            <input
              type="password"
              v-model="localTmdbApiKey"
              class="form-input"
              placeholder="Введите ваш TMDB API key"
            />
            <p class="form-hint">
              Для постеров фильмов. Получите бесплатный ключ на
              <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">
                TMDB
              </a>
            </p>
          </div>

          <div class="form-group">
            <label class="form-label">
              CORS Proxy URL
              <span class="optional">(если Todoist не загружается)</span>
            </label>
            <input
              type="text"
              v-model="localCorsProxy"
              class="form-input"
              placeholder="https://your-proxy.workers.dev"
            />
            <p class="form-hint">
              Если фильмы не загружаются из-за ошибки сети (CORS), укажите URL прокси.
              Можно развернуть бесплатный Cloudflare Worker —
              <a href="https://developers.cloudflare.com/workers/" target="_blank" rel="noopener">
                инструкция
              </a>
            </p>
          </div>

          <div class="info-box">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 16v-4"></path>
              <path d="M12 8h.01"></path>
            </svg>
            <div>
              <strong>Приватность</strong>
              <p>API ключи хранятся только локально в вашем браузере и никуда не отправляются.</p>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="emit('close')">
            Отмена
          </button>
          <button
            class="btn btn-primary"
            @click="save"
            :disabled="!localTodoistToken"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 2rem;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  background: var(--bg-secondary);
  border-radius: 16px;
  max-width: 500px;
  width: 100%;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  font-size: 1.25rem;
  font-weight: 600;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.modal-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-size: 0.9rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.required {
  color: var(--accent);
}

.optional {
  color: var(--text-muted);
  font-weight: 400;
  font-size: 0.8rem;
}

.form-input {
  padding: 0.75rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.95rem;
  transition: all 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(229, 9, 20, 0.1);
}

.form-input::placeholder {
  color: var(--text-muted);
}

.form-hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.form-hint a {
  color: var(--accent);
  text-decoration: none;
}

.form-hint a:hover {
  text-decoration: underline;
}

.info-box {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-card);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.info-box svg {
  flex-shrink: 0;
  color: var(--text-muted);
}

.info-box strong {
  display: block;
  font-size: 0.9rem;
  margin-bottom: 0.25rem;
}

.info-box p {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1.5rem;
  border-top: 1px solid var(--border);
}

.btn {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-secondary {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.btn-secondary:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.btn-primary {
  background: var(--accent);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .modal-overlay {
    padding: 1rem;
  }

  .modal-header,
  .modal-body,
  .modal-footer {
    padding: 1rem;
  }
}
</style>
