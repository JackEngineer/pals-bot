import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './styles/global.css'

// 调试信息：应用启动
console.log('🚀 Mini App 启动中...')
console.log('📊 环境信息:', {
  dev: import.meta.env.DEV,
  mode: import.meta.env.MODE,
  baseUrl: import.meta.env.BASE_URL,
  viteEnv: import.meta.env
})

// 检查Telegram WebApp环境
console.log('📱 Telegram WebApp 检查:', {
  hasTelegram: !!window.Telegram,
  hasWebApp: !!window.Telegram?.WebApp,
  initData: window.Telegram?.WebApp?.initData || 'null',
  platform: window.Telegram?.WebApp?.platform || 'unknown'
})

// 初始化Telegram Web App（仅在生产环境）
if (!import.meta.env.DEV && window.Telegram?.WebApp) {
  console.log('✅ 生产环境：初始化Telegram WebApp')
  window.Telegram.WebApp.ready()
  window.Telegram.WebApp.expand()
  console.log('📐 WebApp 已展开')
} else if (import.meta.env.DEV) {
  console.log('🔧 开发环境：跳过Telegram WebApp初始化')
}

try {
  console.log('🏗️ 创建Vue应用...')
  const app = createApp(App)
  
  console.log('🗄️ 创建Pinia store...')
  const pinia = createPinia()

  console.log('📝 注册插件...')
  app.use(pinia)
  app.use(router)

  console.log('🎯 挂载应用到DOM...')
  app.mount('#app')
  
  console.log('✅ Mini App 启动成功!')
} catch (error) {
  console.error('❌ Mini App 启动失败:', error)
  
  // 显示错误信息到页面
  const appEl = document.getElementById('app')
  if (appEl) {
    appEl.innerHTML = `
      <div style="padding: 20px; text-align: center; color: red;">
        <h2>应用启动失败</h2>
        <p>${error instanceof Error ? error.message : '未知错误'}</p>
        <button onclick="location.reload()" style="margin-top: 10px; padding: 10px 20px;">重新加载</button>
      </div>
    `
  }
} 