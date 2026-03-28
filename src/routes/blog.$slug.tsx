import { createFileRoute, notFound } from '@tanstack/react-router'
import { getBlogPostBySlug, getAllBlogPosts } from '@/lib/blog'
import { generateStructuredData } from '@/lib/seo'
import { StructuredData } from '@/components/seo/structured-data'
import { ArrowLeft } from 'lucide-react'
import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('/blog/$slug')({
  component: BlogPostPage,
  head: ({ params }) => ({
    meta: [
      { title: 'Blog Post - Zapdev' },
      { name: 'description', content: 'Read our latest insights' },
    ],
  }),
  loader: async ({ params }) => {
    const post = getBlogPostBySlug(params.slug)
    if (!post) throw notFound()
    return { post }
  },
})

function BlogPostPage() {
  const { post } = Route.useLoaderData()

  const structuredData = [
    generateStructuredData('BlogPosting', {
      headline: post.title,
      description: post.excerpt,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      author: {
        '@type': 'Organization',
        name: 'Zapdev',
      },
    }),
  ]

  return (
    <>
      <StructuredData data={structuredData} />
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <Link to="/blog" className="flex items-center text-muted-foreground hover:text-primary mb-8">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Blog
        </Link>

        <article>
          <header className="mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">{post.title}</h1>
            <div className="flex items-center gap-4 text-muted-foreground">
              <span>{new Date(post.publishedAt).toLocaleDateString()}</span>
              <span>•</span>
              <span>{post.readingTime} min read</span>
            </div>
          </header>

          <div 
            className="prose prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </article>
      </div>
    </>
  )
}
