import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      component: () => import('@/layouts/DefaultLayout.vue'),
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('@/views/LandingPage.vue')
        },
        {
          path: 'projects',
          name: 'projects',
          component: () => import('@/views/ProjectShowcase.vue')
        },
        {
          path: 'projects/:slug',
          name: 'project-detail',
          component: () => import('@/views/ProjectDetail.vue')
        },
        {
          path: 'skills',
          name: 'skills',
          component: () => import('@/views/SkillsDetail.vue')
        },
        {
          path: 'tools',
          name: 'tools',
          component: () => import('@/views/ToolsIUse.vue')
        },
        {
          path: 'certificates',
          name: 'certificates',
          component: () => import('@/views/CertificatesPage.vue')
        },
        {
          path: 'automation',
          name: 'automation',
          component: () => import('@/views/AutomationProjectsPage.vue')
        },
        {
          path: 'news',
          name: 'news',
          component: () => import('@/views/NewsPage.vue')
        },
      ]
    },
    {
      path: '/video/:slug',
      name: 'video-player',
      component: () => import('@/views/VideoPlayerPage.vue')
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/admin/LoginPage.vue')
    },
    {
      path: '/admin',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'admin-dashboard',
          component: () => import('@/views/admin/Dashboard.vue')
        },
        {
          path: 'projects',
          name: 'admin-projects',
          component: () => import('@/views/admin/Projects.vue')
        },
        {
          path: 'skills',
          name: 'admin-skills',
          component: () => import('@/views/admin/Skills.vue')
        },
        {
          path: 'tools',
          name: 'admin-tools',
          component: () => import('@/views/admin/Tools.vue')
        },
        {
          path: 'sections',
          name: 'admin-sections',
          component: () => import('@/views/admin/Sections.vue')
        },
        {
          path: 'messages',
          name: 'admin-messages',
          component: () => import('@/views/admin/Messages.vue')
        },
        {
          path: 'connections',
          name: 'admin-connections',
          component: () => import('@/views/admin/ConnectionHealth.vue')
        },
        {
          path: 'news',
          name: 'admin-news',
          component: () => import('@/views/admin/News.vue')
        },
        {
          path: 'resume',
          name: 'admin-resume',
          component: () => import('@/views/admin/Resume.vue')
        },
        {
          path: 'git-nexus',
          name: 'admin-git-nexus',
          component: () => import('@/views/admin/GitNexus.vue')
        },
        {
          path: 'certificates',
          name: 'admin-certificates',
          component: () => import('@/views/admin/Certificates.vue')
        },
        {
          path: 'credentials',
          name: 'admin-credentials',
          component: () => import('@/views/admin/Credentials.vue')
        },
        {
          path: 'phantom',
          name: 'admin-phantom',
          component: () => import('@/views/admin/PhantomReport.vue')
        },
      ]
    },
    {
      path: '/admin/jobs',
      component: () => import('@/layouts/JobsLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'admin-jobs',
          component: () => import('@/views/admin/Jobs.vue')
        },
        {
          path: 'search',
          name: 'admin-jobs-search',
          component: () => import('@/views/admin/JobSearch.vue')
        },
        {
          path: 'posts',
          name: 'admin-jobs-posts',
          component: () => import('@/views/admin/JobPosts.vue')
        },
        {
          path: 'platforms',
          name: 'admin-jobs-platforms',
          component: () => import('@/views/admin/JobPlatforms.vue')
        },
        {
          path: 'applications',
          name: 'admin-jobs-applications',
          component: () => import('@/views/admin/JobApplications.vue')
        },
        {
          path: 'profile',
          name: 'admin-jobs-profile',
          component: () => import('@/views/admin/JobProfile.vue')
        },
        {
          path: 'agent',
          name: 'admin-jobs-agent',
          component: () => import('@/views/admin/JobAgent.vue')
        },
        {
          path: 'api-usage',
          name: 'admin-jobs-api',
          component: () => import('@/views/admin/JobApiUsage.vue')
        },
      ]
    },
  ]
})

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()
    if (!authStore.isAuthenticated) {
      return { name: 'login' }
    }
  }
})

export default router
