<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  message: String,
  type: {
    type: String,
    default: 'success' // success, error, info
  },
  show: Boolean,
  duration: {
    type: Number,
    default: 4000
  },
  actionText: String,
  actionCallback: Function
})

const emit = defineEmits(['close', 'action'])

let timeoutId = null

watch(() => props.show, (newVal) => {
  if (newVal && props.duration > 0) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      emit('close')
    }, props.duration)
  }
})

function handleAction() {
  clearTimeout(timeoutId)
  emit('action')
}

function handleClose() {
  clearTimeout(timeoutId)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="show" class="toast-container">
        <div :class="['toast', `toast-${type}`]">
          <div class="toast-icon">
            <!-- Success icon -->
            <svg v-if="type === 'success'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <!-- Error icon -->
            <svg v-else-if="type === 'error'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            <!-- Info icon -->
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 16v-4"></path>
              <path d="M12 8h.01"></path>
            </svg>
          </div>
          <span class="toast-message">{{ message }}</span>
          <button
            v-if="actionText"
            class="toast-action"
            @click="handleAction"
          >
            {{ actionText }}
          </button>
          <button
            class="toast-close"
            @click="handleClose"
            aria-label="Закрыть уведомление"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  pointer-events: auto;
  min-width: 300px;
  max-width: 500px;
}

.toast-success {
  border-color: #4ade80;
  background: linear-gradient(135deg, rgba(74, 222, 128, 0.1) 0%, var(--bg-card) 100%);
}

.toast-success .toast-icon {
  color: #4ade80;
}

.toast-error {
  border-color: #ef4444;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, var(--bg-card) 100%);
}

.toast-error .toast-icon {
  color: #ef4444;
}

.toast-info {
  border-color: #60a5fa;
  background: linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, var(--bg-card) 100%);
}

.toast-info .toast-icon {
  color: #60a5fa;
}

.toast-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toast-message {
  flex: 1;
  font-size: 0.9rem;
  color: var(--text-primary);
  line-height: 1.4;
}

.toast-action {
  flex-shrink: 0;
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.toast-action:hover {
  background: var(--accent-hover);
  transform: scale(1.05);
}

.toast-close {
  flex-shrink: 0;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.toast-close:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.1);
}

/* Animations */
.toast-enter-active {
  animation: toastIn 0.3s ease-out;
}

.toast-leave-active {
  animation: toastOut 0.2s ease-in;
}

@keyframes toastIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes toastOut {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(20px);
  }
}

@media (max-width: 768px) {
  .toast-container {
    bottom: 1rem;
    left: 1rem;
    right: 1rem;
    transform: none;
  }

  .toast {
    min-width: auto;
    max-width: none;
    width: 100%;
  }
}
</style>
