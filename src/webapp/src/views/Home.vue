<template>
  <div class="home-page">
    <!-- 欢迎卡片 -->
    <div class="card">
      <h2>🌊 欢迎来到漂流瓶世界</h2>
      <p>在这里分享你的心情，发现他人的故事</p>
    </div>

    <!-- 统计卡片 -->
    <div class="card">
      <h3>📊 我的统计</h3>
      <div class="stats-grid">
        <div class="stat-item" :class="{ 'stat-item-zero': (userStore.userStats?.bottles_thrown || 0) === 0 }">
          <div class="stat-value">{{ userStore.userStats?.bottles_thrown || 0 }}</div>
          <div class="stat-label">投放的瓶子</div>
          <div v-if="(userStore.userStats?.bottles_thrown || 0) === 0" class="stat-hint">
            还没有投放过呢
          </div>
        </div>
        <div class="stat-item" :class="{ 'stat-item-zero': (userStore.userStats?.bottles_picked || 0) === 0 }">
          <div class="stat-value">{{ userStore.userStats?.bottles_picked || 0 }}</div>
          <div class="stat-label">捡到的瓶子</div>
          <div v-if="(userStore.userStats?.bottles_picked || 0) === 0" class="stat-hint">
            试试捡拾功能吧
          </div>
        </div>
        <div class="stat-item" :class="{ 'stat-item-zero': (userStore.userStats?.bottles_replied || 0) === 0 }">
          <div class="stat-value">{{ userStore.userStats?.bottles_replied || 0 }}</div>
          <div class="stat-label">回复的瓶子</div>
          <div v-if="(userStore.userStats?.bottles_replied || 0) === 0" class="stat-hint">
            回复让世界更精彩
          </div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ userStore.userPoints?.total_points || 0 }}</div>
          <div class="stat-label">获得积分</div>
          <div v-if="(userStore.userPoints?.total_points || 0) === 0" class="stat-hint">
            完成操作获得积分
          </div>
        </div>
      </div>
    </div>

    <!-- 快速操作 -->
    <div class="card">
      <h3>🎮 快速操作</h3>
      <div class="action-buttons">
        <button class="btn" @click="showThrowBottle" :disabled="actionLoading">
          📝 投放漂流瓶
        </button>
        <button class="btn btn-secondary" @click="pickBottle" :disabled="actionLoading">
          🎣 捡拾漂流瓶
        </button>
      </div>
    </div>

    <!-- 积分信息 -->
    <div class="card">
      <h3>💰 积分信息</h3>
      <div class="points-info">
        <div class="points-row">
          <span>总积分:</span>
          <strong>{{ userStore.userPoints?.total_points || 0 }}</strong>
        </div>
        <div class="points-row">
          <span>等级:</span>
          <strong>{{ userStore.userPoints?.level || 'Lv.1' }}</strong>
        </div>
        <div class="checkin-section">
          <button 
            class="btn" 
            @click="dailyCheckin" 
            :disabled="checkinLoading || isCheckedIn"
          >
            <span v-if="checkinLoading">签到中...</span>
            <span v-else-if="isCheckedIn">✅ 今日已签到</span>
            <span v-else>📅 每日签到</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 投放漂流瓶弹窗 -->
    <ThrowBottleModal 
      v-if="showThrowModal"
      @close="showThrowModal = false"
      @success="onBottleThrown"
    />

    <!-- 捡拾的漂流瓶弹窗 -->
    <PickedBottleModal
      v-if="pickedBottle"
      :bottle="pickedBottle"
      @close="pickedBottle = null"
      @reply="onBottleReply"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUserStore } from '@/stores/user'
import { api } from '@/utils/api'
import ThrowBottleModal from '@/components/ThrowBottleModal.vue'
import PickedBottleModal from '@/components/PickedBottleModal.vue'

const userStore = useUserStore()

// 状态
const actionLoading = ref(false)
const checkinLoading = ref(false)
const showThrowModal = ref(false)
const pickedBottle = ref<any>(null)

// 计算属性
const isCheckedIn = computed(() => {
  if (!userStore.userPoints?.last_checkin) return false
  const today = new Date().toDateString()
  const lastCheckin = new Date(userStore.userPoints.last_checkin).toDateString()
  return today === lastCheckin
})

// 方法
const showThrowBottle = () => {
  showThrowModal.value = true
}

const pickBottle = async () => {
  try {
    actionLoading.value = true
    const bottle = await api.post('/bottles/pick')
    pickedBottle.value = bottle
  } catch (error) {
    console.error('捡拾漂流瓶失败:', error)
    // 这里可以添加Toast提示
  } finally {
    actionLoading.value = false
  }
}

const dailyCheckin = async () => {
  try {
    checkinLoading.value = true
    const result = await userStore.checkin()
    console.log('签到成功:', result)
    // 这里可以添加成功提示
  } catch (error) {
    console.error('签到失败:', error)
    // 这里可以添加错误提示
  } finally {
    checkinLoading.value = false
  }
}

const onBottleThrown = () => {
  showThrowModal.value = false
  userStore.updateUserData()
}

const onBottleReply = () => {
  pickedBottle.value = null
  userStore.updateUserData()
}
</script>

<style scoped>
.home-page {
  padding: 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 1rem;
}

.stat-item {
  text-align: center;
  position: relative;
  padding: 0.5rem;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.stat-item-zero {
  opacity: 0.7;
}

.stat-item-zero:hover {
  opacity: 1;
  background-color: var(--tg-theme-section-bg-color, rgba(0, 123, 255, 0.05));
}

.stat-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: var(--tg-theme-button-color);
}

.stat-item-zero .stat-value {
  color: var(--tg-theme-hint-color);
}

.stat-label {
  font-size: 0.9rem;
  color: var(--tg-theme-hint-color);
  margin-top: 0.2rem;
}

.stat-hint {
  font-size: 0.75rem;
  color: var(--tg-theme-hint-color);
  margin-top: 0.3rem;
  font-style: italic;
  opacity: 0.8;
}

.action-buttons {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}

.action-buttons .btn {
  flex: 1;
  min-width: 140px;
}

.points-info {
  margin-top: 1rem;
}

.points-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.checkin-section {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--tg-theme-section-separator-color);
}

@media (max-width: 480px) {
  .action-buttons {
    flex-direction: column;
  }
  
  .action-buttons .btn {
    width: 100%;
  }
  
  .stats-grid {
    grid-template-columns: 1fr 1fr;
    gap: 0.8rem;
  }
  
  .stat-value {
    font-size: 1.2rem;
  }
}
</style> 