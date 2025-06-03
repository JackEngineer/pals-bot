<template>
  <header class="header">
    <div class="header-content">
      <div class="user-info">
        <div class="user-avatar">{{ userStore.userInitial }}</div>
        <span>{{ userStore.userName }}</span>
        <span v-if="userStore.isVip" class="vip-badge">VIP</span>
      </div>
      <div class="points-display">
        积分： {{ userStore.userPoints?.total_points || 0 }}
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
</script>

<style scoped>
.vip-badge {
  background: linear-gradient(45deg, #ffd700, #ffed4e);
  color: #333;
  padding: 0.2rem 0.5rem;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: bold;
  margin-left: 0.5rem;
}
</style> 