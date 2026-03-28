import { createFileRoute } from '@tanstack/react-router'
import { getAllFrameworks } from '@/lib/frameworks'
import { generateStructuredData } from '@/lib/seo'
import { StructuredData } from '@/components/seo/structured-data'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { ArrowRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('/frameworks')({
  component: FrameworksPage,
  head: () => ({
    meta: [
      { title: 'AI-Powered Development for All Frameworks | Zapdev' },
      { name: 'description', content: 'Build applications with React, Vue, Angular, Svelte, and Next.js using AI assistance.' },
    ],
  }),
})

function FrameworksPage() {
  const frameworks = getAllFrameworks()

  const structuredData = [
    generateStructuredData('WebApplication', {
      name: 'Zapdev Framework Hub',
      description: 'AI-powered development platform supporting multiple frameworks',
    }),
  ]

  return (
    <>
      <StructuredData data={structuredData} />
      <div className="container mx-auto px-4 py-16 max-w-7xl">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">Choose Your Framework</h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Build production-ready applications with AI assistance across all major JavaScript frameworks.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {frameworks.map((framework) => (
            <Link
              key={framework.slug}
              to={`/frameworks/$slug`}
              params={{ slug: framework.slug }}
              className="block transition-transform hover:scale-105"
            >
              <Card className="h-full hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-4xl">{framework.icon}</span>
                    <Badge variant="secondary">{framework.popularity}% Popular</Badge>
                  </div>
                  <CardTitle className="text-2xl">{framework.name}</CardTitle>
                  <CardDescription className="text-base">
                    {framework.metaDescription}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Community Adoption</span>
                        <span>{framework.popularity}%</span>
                      </div>
                      <Progress value={framework.popularity} className="h-2" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {framework.features.slice(0, 3).map((feature) => (
                        <Badge key={feature} variant="outline" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center text-primary font-medium">
                      Learn more <ArrowRight className="ml-2 h-4 w-4" />
                    </div>
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
