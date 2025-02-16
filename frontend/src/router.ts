// import Vue from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import Home from './views/Home.vue'
import Settings from './views/Settings.vue'
import About from './views/About.vue'
import Schedule from './views/Schedule.vue'
import Wifi from './views/Wifi.vue'
import Login from './views/Login.vue'
import { store } from '@/service/store'

const ifNotAuthenticated = (to, from, next) => {
  if (store.state.isAuthenticated) {
    next()
    return
  }
  next('/login')
}

// Vue.use(Router)

const routes = [
  {
    path: '/',
    name: 'home',
    component: Home,
    beforeEnter: ifNotAuthenticated
  },
  {
    path: '/schedule',
    name: 'schedule',
    component: Schedule,
    beforeEnter: ifNotAuthenticated
  },
  {
    path: '/wifi',
    name: 'wifi',
    component: Wifi,
    beforeEnter: ifNotAuthenticated
  },
  {
    path: '/settings',
    name: 'settings',
    component: Settings,
    beforeEnter: ifNotAuthenticated
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

export default router
