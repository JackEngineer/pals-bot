import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

console.log('🛣️ 初始化路由系统...')

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => {
      console.log('📄 加载Home组件...')
      return import('@/views/Home.vue')
    },
    meta: { title: '首页' }
  },
  {
    path: '/bottles',
    name: 'Bottles',
    component: () => {
      console.log('📄 加载Bottles组件...')
      return import('@/views/Bottles.vue')
    },
    meta: { title: '漂流瓶' }
  },
  {
    path: '/shop',
    name: 'Shop',
    component: () => {
      console.log('📄 加载Shop组件...')
      return import('@/views/Shop.vue')
    },
    meta: { title: '商店' }
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => {
      console.log('📄 加载Profile组件...')
      return import('@/views/Profile.vue')
    },
    meta: { title: '我的' }
  },
  {
    path: '/bottle/:id',
    name: 'BottleDetail',
    component: () => {
      console.log('📄 加载BottleDetail组件...')
      return import('@/views/BottleDetail.vue')
    },
    meta: { title: '漂流瓶详情' }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    redirect: '/'
  }
]

console.log('📚 注册路由配置:', routes.map(r => ({ path: r.path, name: r.name })))

const router = createRouter({
  history: createWebHistory('/'),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  console.log('🚥 路由跳转:', {
    from: from.path,
    to: to.path,
    name: to.name,
    params: to.params,
    query: to.query
  })
  
  // 设置页面标题
  if (to.meta?.title) {
    document.title = `${to.meta.title} - 漂流瓶`
    console.log('📝 设置页面标题:', document.title)
  }
  
  next()
})

router.afterEach((to, from) => {
  console.log('✅ 路由跳转完成:', {
    from: from.path,
    to: to.path,
    name: to.name
  })
})

router.onError((error) => {
  console.error('❌ 路由错误:', error)
})

console.log('🛣️ 路由系统初始化完成')

export default router 