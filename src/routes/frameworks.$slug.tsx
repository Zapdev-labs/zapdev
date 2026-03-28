import { createFileRoute, notFound } from '@tanstack/react-router'
import { getFrameworkBySlug } from '@/lib/frameworks'
import { generateStructuredData } from '@/lib/seo'
import { StructuredData } from '@/components/seo/structured-data'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react'
import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('/frameworks/$slug')({
  component: FrameworkDetailPage,
  head: () => ({
    meta: [
      { title: 'Framework - Zapdev' },
      { name: 'description', content: 'Learn about this framework' },
    ],
  }),
  loader: async ({ params }) => {
    const framework = getFrameworkBySlug(params.slug)
    if (!framework) throw notFound()
    return { framework }
  },
})

function FrameworkDetailPage() {
  const { framework } = Route.useLoaderData()

  return (
    <>
      <StructuredData data={[generateStructuredData('SoftwareApplication', { name: framework.name })]} />
      <div className="container mx-auto px-4 py-16 max-w-5xl">
        <Link to="/frameworks" className="flex items-center text-muted-foreground hover:text-primary mb-8">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Frameworks
        </Link>

        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <span className="text-6xl mb-6 block">{framework.icon}</span>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">{framework.name}</h1>
            <p className="text-xl text-muted-foreground mb-6">{framework.description}</p>
            <Link to="/">
              <Button size="lg" className="gap-2">
                Start Building with {framework.name}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Key Features</h2>
            <ul className="space-y-4">
              {framework.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}
