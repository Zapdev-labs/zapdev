import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import { DashboardView } from '@/modules/home/ui/views/dashboard-view'

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const { isAuthenticated } = await auth()
  if (!isAuthenticated) {
    throw redirect({ to: '/' })
  }
  return { isAuthenticated }
})

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: 'Dashboard - Zapdev' },
      { name: 'description', content: 'Manage your projects and account' },
    ],
  }),
  beforeLoad: async () => {
    await checkAuth()
  },
})

function DashboardPage() {
  return <DashboardView />
}
