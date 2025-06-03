import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiRequest } from '@/utils/api'

export interface User {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface UserStats {
  bottles_thrown: number
  bottles_picked: number
  bottles_replied: number
  points_earned: number
}

export interface UserPoints {
  total_points: number
  level: string
  last_checkin?: string
  vip_expires_at?: string
}

export const useUserStore = defineStore('user', () => {
  console.log('🏪 创建UserStore...')
  
  // State
  const user = ref<User | null>(null)
  const userStats = ref<UserStats | null>(null)
  const userPoints = ref<UserPoints | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const isAuthenticated = computed(() => {
    const auth = !!user.value
    console.log('🔐 认证状态检查:', auth)
    return auth
  })
  
  const userName = computed(() => {
    if (!user.value) return '用户'
    const name = user.value.first_name || user.value.username || '用户'
    console.log('👤 获取用户名:', name)
    return name
  })
  
  const userInitial = computed(() => {
    if (!user.value) return '?'
    const initial = (user.value.first_name || user.value.username || '?')[0].toUpperCase()
    console.log('🔤 获取用户首字母:', initial)
    return initial
  })
  
  const isVip = computed(() => {
    if (!userPoints.value?.vip_expires_at) return false
    const vipStatus = new Date(userPoints.value.vip_expires_at) > new Date()
    console.log('💎 VIP状态检查:', vipStatus, userPoints.value.vip_expires_at)
    return vipStatus
  })

  // Actions
  const initUser = async () => {
    console.log('🚀 开始初始化用户...')
    loading.value = true
    error.value = null
    
    try {
      console.log('📞 调用用户资料API...')
      const userData = await apiRequest('/user/profile')
      
      console.log('📋 收到用户数据:', {
        hasUser: !!userData.user,
        hasStats: !!userData.stats,
        hasPoints: !!userData.points,
        userId: userData.user?.id,
        userName: userData.user?.first_name || userData.user?.username
      })
      
      user.value = userData.user
      userStats.value = userData.stats
      userPoints.value = userData.points
      
      console.log('✅ 用户初始化成功!')
      console.log('👤 用户信息:', user.value)
      console.log('📊 用户统计:', userStats.value)
      console.log('💰 用户积分:', userPoints.value)
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取用户信息失败'
      error.value = errorMsg
      
      console.error('❌ 用户初始化失败:', {
        error: errorMsg,
        originalError: err,
        stack: err instanceof Error ? err.stack : undefined
      })
    } finally {
      loading.value = false
      console.log('🏁 用户初始化结束, loading:', loading.value)
    }
  }

  const updateUserData = async () => {
    console.log('🔄 更新用户数据...')
    try {
      const userData = await apiRequest('/user/profile')
      user.value = userData.user
      userStats.value = userData.stats
      userPoints.value = userData.points
      console.log('✅ 用户数据更新成功')
    } catch (err) {
      console.error('❌ 更新用户数据失败:', err)
    }
  }

  const checkin = async () => {
    console.log('📅 执行签到...')
    try {
      const result = await apiRequest('/checkin', {
        method: 'POST'
      })
      
      console.log('✅ 签到成功:', result)
      
      // 更新用户数据
      await updateUserData()
      
      return result
    } catch (err) {
      console.error('❌ 签到失败:', err)
      throw err instanceof Error ? err : new Error('签到失败')
    }
  }

  const updatePoints = (points: number) => {
    console.log('💰 更新积分:', points)
    if (userPoints.value) {
      userPoints.value.total_points = points
    }
  }

  const updateStats = (stats: Partial<UserStats>) => {
    console.log('📊 更新统计数据:', stats)
    if (userStats.value) {
      Object.assign(userStats.value, stats)
    }
  }

  console.log('🏪 UserStore创建完成')

  return {
    // State
    user,
    userStats,
    userPoints,
    loading,
    error,
    
    // Getters
    isAuthenticated,
    userName,
    userInitial,
    isVip,
    
    // Actions
    initUser,
    updateUserData,
    checkin,
    updatePoints,
    updateStats
  }
}) 