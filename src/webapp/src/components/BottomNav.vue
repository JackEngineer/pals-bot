<template>
  <nav class="bottom-nav">
    <router-link 
      v-for="item in navItems" 
      :key="item.name"
      :to="item.path"
      class="nav-item"
      :class="{ active: $route.name === item.name }"
    >
      <span class="nav-icon">{{ item.icon }}</span>
      <span>{{ item.label }}</span>
    </router-link>
  </nav>
</template>

<script setup lang="ts">
const navItems = [
  { name: 'Home', path: '/', icon: '🏠', label: '首页' },
  { name: 'Bottles', path: '/bottles', icon: '🍾', label: '漂流瓶' },
  { name: 'Shop', path: '/shop', icon: '🛒', label: '商店' },
  { name: 'Profile', path: '/profile', icon: '👤', label: '我的' }
]
</script>

<style scoped>
.nav-item {
  transition: all 0.2s ease;
}

.nav-item:hover {
  transform: translateY(-2px);
}
</style> 