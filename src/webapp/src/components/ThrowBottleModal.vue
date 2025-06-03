<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h3>📝 投放漂流瓶</h3>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>
      
      <div class="modal-body">
        <textarea 
          v-model="content"
          placeholder="写下你想说的话..."
          rows="6"
          maxlength="500"
        ></textarea>
        <div class="char-count">{{ content.length }}/500</div>
      </div>
      
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button 
          class="btn" 
          @click="throwBottle" 
          :disabled="!content.trim() || loading"
        >
          {{ loading ? '投放中...' : '投放' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { api } from '@/utils/api'

const emit = defineEmits<{
  close: []
  success: []
}>()

const content = ref('')
const loading = ref(false)

const throwBottle = async () => {
  if (!content.value.trim()) return
  
  try {
    loading.value = true
    await api.post('/bottles/throw', { content: content.value.trim() })
    emit('success')
  } catch (error) {
    console.error('投放漂流瓶失败:', error)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background-color: var(--tg-theme-bg-color);
  border-radius: 12px;
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--tg-theme-section-separator-color);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: var(--tg-theme-hint-color);
}

.modal-body {
  padding: 1rem;
}

.modal-body textarea {
  width: 100%;
  border: 1px solid var(--tg-theme-section-separator-color);
  border-radius: 8px;
  padding: 0.8rem;
  font-size: 1rem;
  resize: vertical;
  background-color: var(--tg-theme-secondary-bg-color);
  color: var(--tg-theme-text-color);
}

.char-count {
  text-align: right;
  font-size: 0.8rem;
  color: var(--tg-theme-hint-color);
  margin-top: 0.5rem;
}

.modal-footer {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border-top: 1px solid var(--tg-theme-section-separator-color);
}

.modal-footer .btn {
  flex: 1;
}
</style> 