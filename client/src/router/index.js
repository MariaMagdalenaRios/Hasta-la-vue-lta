import { useAuthStore } from '../stores/auth'
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/about',
      name: 'about',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/AboutView.vue'),
    },
    {
      path: '/guides',
      name: 'guides',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/GuidesView.vue'),
    },
    {
      path: '/tours',
      name: 'tours',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/ToursView.vue'),
    },
    {
      path: '/guider/:slug',
      name: 'guide',
      component: () => import('../views/GuideDetailView.vue'),
    },
    {
      path: '/turer/:id',
      name: 'tour',
      component: () => import('../views/TourDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profil',
      name: 'profile',
      component: () => import('../views/ProfileView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return {
      name: 'login',
      query: { till: to.fullPath },
    }
  }

  if (to.name === 'login' && auth.isLoggedIn) {
    return '/'
  }
})

export default router
