import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/solutions/$slug')({
  component: SolutionDetailPage,
  head: () => ({
    meta: [
      { title: 'Solution - Zapdev' },
      { name: 'description', content: 'Learn about this solution' },
    ],
  }),
})

function SolutionDetailPage() {
  const { slug } = Route.useParams()
  
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Solution: {slug}</h1>
      <p className="text-lg text-muted-foreground">
        Detailed information about this solution coming soon.
      </p>
    </div>
  )
}
