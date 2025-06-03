<template>
  <div class="app-container">
    <!-- 调试信息面板 (仅在开发环境显示) -->
    <div v-if="isDev" class="debug-panel">
      <details>
        <summary>🐛 调试信息</summary>
        <div class="debug-content">
          <p><strong>加载状态:</strong> {{ loading }}</p>
          <p><strong>错误信息:</strong> {{ error || '无' }}</p>
          <p><strong>用户认证:</strong> {{ userStore.isAuthenticated }}</p>
          <p><strong>用户ID:</strong> {{ userStore.user?.id || '未知' }}</p>
          <p><strong>用户名:</strong> {{ userStore.userName }}</p>
          <p><strong>环境:</strong> {{ envMode }}</p>
        </div>
      </details>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <div>正在加载...</div>
        <div class="loading-details">
          <small>{{ loadingMessage }}</small>
        </div>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-container">
      <h2>😔 加载失败</h2>
      <p class="error-message">{{ error }}</p>
      <div class="error-details">
        <details>
          <summary>技术详情</summary>
          <div class="error-info">
            <p><strong>时间:</strong> {{ new Date().toLocaleString() }}</p>
            <p><strong>环境:</strong> {{ envMode }}</p>
            <p><strong>URL:</strong> {{ window.location.href }}</p>
            <p><strong>User Agent:</strong> {{ navigator.userAgent }}</p>
          </div>
        </details>
      </div>
      <div class="error-actions">
        <button class="btn primary" @click="retry">🔄 重试</button>
        <button class="btn secondary" @click="openConsole">🔍 查看控制台</button>
      </div>
    </div>

    <!-- 应用主体 -->
    <div v-else>
      <!-- 头部导航 -->
      <AppHeader />
      
      <!-- 主要内容区 -->
      <main class="main-content">
        <router-view v-slot="{ Component, route }">
          <transition name="fade" mode="out-in">
            <component :is="Component" :key="route.path" />
          </transition>
        </router-view>
      </main>
      
      <!-- 底部导航 -->
      <BottomNav />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import AppHeader from '@/components/AppHeader.vue'
import BottomNav from '@/components/BottomNav.vue'

console.log('🎨 App.vue 组件初始化...')

const userStore = useUserStore()
const loadingMessage = ref('初始化应用...')

// 在script中定义环境变量，避免模板中使用import.meta导致的编译错误
const isDev = import.meta.env.DEV
const envMode = import.meta.env.MODE

const loading = computed(() => {
  console.log('⏳ 计算loading状态:', userStore.loading)
  return userStore.loading
})

const error = computed(() => {
  console.log('❌ 计算error状态:', userStore.error)
  return userStore.error
})

// 监听loading状态变化
watch(loading, (newVal, oldVal) => {
  console.log('⏳ Loading状态变化:', { from: oldVal, to: newVal })
  if (newVal) {
    loadingMessage.value = '正在获取用户信息...'
  }
})

// 监听error状态变化
watch(error, (newVal, oldVal) => {
  console.log('❌ Error状态变化:', { from: oldVal, to: newVal })
})

// 监听用户认证状态
watch(() => userStore.isAuthenticated, (newVal, oldVal) => {
  console.log('🔐 认证状态变化:', { from: oldVal, to: newVal })
})

const retry = () => {
  console.log('🔄 用户点击重试按钮')
  loadingMessage.value = '重新初始化...'
  userStore.initUser()
}

const openConsole = () => {
  console.log('🔍 用户请求查看控制台')
  alert('请按F12打开开发者工具查看控制台信息')
}

onMounted(() => {
  console.log('🎯 App组件挂载完成，开始初始化用户')
  loadingMessage.value = '连接服务器...'
  userStore.initUser()
})

console.log('🎨 App.vue 组件设置完成')
</script>

<style scoped>
.app-container {
  min-height: 100vh;
}

.debug-panel {
  position: fixed;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 10px;
  border-radius: 5px;
  font-size: 12px;
  z-index: 9999;
  max-width: 300px;
}

.debug-content {
  margin-top: 5px;
}

.debug-content p {
  margin: 2px 0;
}

.loading-details {
  margin-top: 10px;
  opacity: 0.7;
}

.error-container {
  padding: 2rem;
  text-align: center;
  max-width: 500px;
  margin: 0 auto;
}

.error-message {
  margin: 1rem 0;
  padding: 1rem;
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 5px;
  color: #856404;
}

.error-details {
  margin: 1rem 0;
  text-align: left;
}

.error-info {
  background: #f8f9fa;
  padding: 10px;
  border-radius: 3px;
  font-size: 12px;
  margin-top: 5px;
}

.error-info p {
  margin: 3px 0;
  word-break: break-all;
}

.error-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 1rem;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.btn.primary {
  background: var(--tg-theme-button-color, #2481cc);
  color: white;
}

.btn.secondary {
  background: #6c757d;
  color: white;
}

.btn:hover {
  opacity: 0.8;
}
</style> 