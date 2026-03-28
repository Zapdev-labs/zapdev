import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import { inngest } from '@/inngest/client'

export const runAgent = createServerFn({ method: 'POST' })
  .handler(async (ctx: { data: { projectId: string; value: string; model?: string } }) => {
    try {
      const { isAuthenticated, userId } = await auth()

      if (!isAuthenticated || !userId) {
        return { error: 'Unauthorized', status: 401 }
      }

      const { projectId, value, model } = ctx.data

      if (!projectId?.trim() || !value?.trim()) {
        return { error: 'Missing required fields: projectId and value', status: 400 }
      }

      await inngest.send({
        name: 'agent/code-agent-kit.run',
        data: {
          projectId,
          value,
          userId,
          model: model?.trim() || undefined,
        },
      })

      return { accepted: true, status: 202 }
    } catch (error) {
      console.error('[Agent Run] Failed:', error)
      return {
        error: 'Failed to process request',
        details: error instanceof Error ? error.message : 'Unknown error',
        status: 500,
      }
    }
  })
