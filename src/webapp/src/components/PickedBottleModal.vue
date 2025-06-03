<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h3>🍾 捡到的漂流瓶</h3>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>
      
      <div class="modal-body">
        <div class="bottle-content">
          <p>{{ bottle.content }}</p>
        </div>
        
        <div class="bottle-info">
          <small>来自: {{ bottle.user_name || '匿名用户' }}</small>
          <small>{{ formatDate(bottle.created_at) }}</small>
        </div>
        
        <div v-if="!showReplyForm" class="reply-section">
          <button class="btn" @click="showReplyForm = true">💬 回复</button>
        </div>
        
        <div v-else class="reply-form">
          <textarea 
            v-model="replyContent"
            placeholder="写下你的回复..."
            rows="4"
            maxlength="300"
          ></textarea>
          <div class="char-count">{{ replyContent.length }}/300</div>
          
          <div class="reply-actions">
            <button class="btn btn-secondary" @click="showReplyForm = false">取消</button>
            <button 
              class="btn" 
              @click="sendReply" 
              :disabled="!replyContent.trim() || loading"
            >
              {{ loading ? '发送中...' : '发送' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { api } from '@/utils/api'

interface Bottle {
  id: number
  content: string
  user_name?: string
  created_at: string
}

const props = defineProps<{
  bottle: Bottle
}>()

const emit = defineEmits<{
  close: []
  reply: []
}>()

const showReplyForm = ref(false)
const replyContent = ref('')
const loading = ref(false)

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('zh-CN')
}

const sendReply = async () => {
  if (!replyContent.value.trim()) return
  
  try {
    loading.value = true
    await api.post(`/bottles/${props.bottle.id}/reply`, { 
      content: replyContent.value.trim() 
    })
    emit('reply')
  } catch (error) {
    console.error('回复失败:', error)
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

.bottle-content {
  background-color: var(--tg-theme-secondary-bg-color);
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.bottle-info {
  display: flex;
  justify-content: space-between;
  color: var(--tg-theme-hint-color);
  font-size: 0.8rem;
  margin-bottom: 1rem;
}

.reply-section {
  text-align: center;
}

.reply-form textarea {
  width: 100%;
  border: 1px solid var(--tg-theme-section-separator-color);
  border-radius: 8px;
  padding: 0.8rem;
  font-size: 1rem;
  resize: vertical;
  background-color: var(--tg-theme-secondary-bg-color);
  color: var(--tg-theme-text-color);
  margin-bottom: 0.5rem;
}

.char-count {
  text-align: right;
  font-size: 0.8rem;
  color: var(--tg-theme-hint-color);
  margin-bottom: 1rem;
}

.reply-actions {
  display: flex;
  gap: 1rem;
}

.reply-actions .btn {
  flex: 1;
}
</style> 