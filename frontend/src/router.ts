// import Vue from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import Home from './views/Home.vue'
import Settings from './views/Settings.vue'
import About from './views/About.vue'
import Schedule from './views/Schedule.vue'
import Wifi from './views/Wifi.vue'
import Login from './views/Login.vue'
import { store } from '@/service/store'

const PROTECTED_ROUTE = { requiresAuth: true }

// Vue.use(Router)

const routes = [
  {
    path: '/',
    name: 'home',
    component: Home,
    meta: PROTECTED_ROUTE
  },
  {
    path: '/schedule',
    name: 'schedule',
    component: Schedule,
    meta: PROTECTED_ROUTE
  },
  {
    path: '/wifi',
    name: 'wifi',
    component: Wifi,
    meta: PROTECTED_ROUTE
  },
  {
    path: '/settings',
    name: 'settings',
    component: Settings,
    meta: PROTECTED_ROUTE
  },
  {
    path: '/about',
    name: 'about',
    component: About
  },
  {
    path: '/login',
    name: 'login',
    component: Login
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  linkActiveClass: 'is-active'
})

router.beforeEach((to, _from, next) => {
  if (to.meta && to.meta.requiresAuth && !store.state.isAuthenticated) {
    next('/login')
  } else {
    next()
  }
})

export default router
