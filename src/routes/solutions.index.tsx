import { createFileRoute } from '@tanstack/react-router'
import { getAllSolutions } from '@/lib/solutions'
import { generateStructuredData } from '@/lib/seo'
import { StructuredData } from '@/components/seo/structured-data'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('/solutions')({
  component: SolutionsPage,
  head: () => ({
    meta: [
      { title: 'AI Development Solutions - Build Faster, Ship Sooner | Zapdev' },
      { name: 'description', content: 'Explore our AI-powered development solutions. From code generation to rapid prototyping.' },
    ],
  }),
})

function SolutionsPage() {
  const solutions = getAllSolutions()

  const structuredData = [
    generateStructuredData('Service', {
      name: 'Zapdev AI Development Solutions',
      description: 'Comprehensive AI-powered development solutions',
    }),
  ]

  return (
    <>
      <StructuredData data={structuredData} />
      <div className="container mx-auto px-4 py-16 max-w-7xl">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">AI Development Solutions</h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Transform your development process with our AI-powered solutions.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {solutions.map((solution) => (
            <Link
              key={solution.slug}
              to={`/solutions/$slug`}
              params={{ slug: solution.slug }}
              className="block transition-transform hover:scale-105"
            >
              <Card className="h-full hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-2xl">{solution.heading}</CardTitle>
                  <CardDescription className="text-base">
                    {solution.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-primary font-medium">
                    Learn more <ArrowRight className="ml-2 h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
