import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

const notFoundFn = createServerFn({ method: 'GET' }).handler(async () => {
  return { status: 404 }
})

export const Route = createFileRoute('/$')({
  component: NotFoundPage,
  head: () => ({
    meta: [
      { title: 'Page Not Found - Zapdev' },
      { name: 'description', content: 'The page you are looking for does not exist.' },
    ],
  }),
  loader: async () => {
    await notFoundFn()
    return {}
  },
})

function NotFoundPage() {
  return (
    <div className="container mx-auto px-4 py-24 text-center">
      <h1 className="text-6xl font-bold mb-4">404</h1>
      <h2 className="text-2xl font-semibold mb-6">Page Not Found</h2>
      <p className="text-muted-foreground mb-8">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link to="/" className="text-primary hover:underline">
        Go back home
      </Link>
    </div>
  )
}
