import { createFileRoute } from '@tanstack/react-router'
import { getAllBlogPosts } from '@/lib/blog'
import { generateStructuredData } from '@/lib/seo'
import { StructuredData } from '@/components/seo/structured-data'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, Clock, Calendar } from 'lucide-react'
import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('/blog')({
  component: BlogPage,
  head: () => ({
    meta: [
      { title: 'Blog - AI Development Insights & Comparisons | Zapdev' },
      { name: 'description', content: 'Expert insights on AI-powered development. Compare Zapdev with Bolt.new, v0.dev, Lovable, Replit, Cursor, and more.' },
    ],
  }),
})

function BlogPage() {
  const posts = getAllBlogPosts()

  const structuredData = [
    generateStructuredData('Organization', {}),
    {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'Zapdev Blog',
      description: 'Expert insights on AI-powered development.',
      url: 'https://zapdev.link/blog',
      blogPost: posts.map(post => ({
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.excerpt,
        datePublished: post.publishedAt,
        url: `https://zapdev.link/blog/${post.slug}`,
      })),
    },
  ]

  return (
    <>
      <StructuredData data={structuredData} />
      <div className="container mx-auto px-4 py-16 max-w-5xl">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">Zapdev Blog</h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Insights on AI-powered development and platform comparisons.
          </p>
        </div>

        <div className="grid gap-8">
          {posts.map((post) => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              className="block transition-transform hover:scale-[1.01]"
            >
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                    <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs font-medium">
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(post.publishedAt).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {post.readingTime} min read
                    </span>
                  </div>
                  <CardTitle className="text-2xl">{post.title}</CardTitle>
                  <CardDescription className="text-base mt-2">
                    {post.excerpt}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-primary font-medium">
                    Read more <ArrowRight className="ml-2 h-4 w-4" />
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
