import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { ProjectView } from '@/modules/projects/ui/views/project-view'
import { ErrorBoundary } from 'react-error-boundary'

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

const getProjectData = createServerFn({ method: 'GET' })
  .handler(async ({ projectId }: { projectId: string }) => {
    if (!convexUrl) throw new Error('Convex URL not configured')
    
    const { isAuthenticated, userId } = await auth()
    if (!isAuthenticated) throw new Error('Unauthorized')
    
    // Convex data is fetched on the client side via the ProjectView component
    // We just verify auth here
    return { userId, projectId }
  })

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectPage,
  head: () => ({
    meta: [
      { title: 'Project - Zapdev' },
      { name: 'description', content: 'View and edit your project' },
    ],
  }),
  loader: async ({ params }) => {
    const { projectId } = params
    await getProjectData({ projectId })
    return { projectId }
  },
})

function ProjectPage() {
  const { projectId } = Route.useLoaderData()
  
  return (
    <ErrorBoundary fallback={<p>Error loading project!</p>}>
      <ProjectView projectId={projectId} />
    </ErrorBoundary>
  )
}
