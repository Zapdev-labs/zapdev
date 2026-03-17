import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBlogPost, getAllBlogPosts } from '@/lib/blog';
import { generateMetadata as generateSEOMetadata, generateArticleStructuredData } from '@/lib/seo';
import { StructuredData } from '@/components/seo/structured-data';
import { Breadcrumbs } from '@/components/seo/breadcrumbs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, Calendar, ArrowRight } from 'lucide-react';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllBlogPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    return generateSEOMetadata({
      title: 'Post Not Found',
      description: 'The requested blog post could not be found.',
      robots: { index: false, follow: false },
    });
  }

  return generateSEOMetadata({
    title: post.metaTitle,
    description: post.metaDescription,
    keywords: post.keywords,
    canonical: `/blog/${post.slug}`,
    openGraph: {
      title: post.metaTitle,
      description: post.metaDescription,
      type: 'article',
    },
  });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    notFound();
  }

  const allPosts = getAllBlogPosts();
  const currentIndex = allPosts.findIndex((p) => p.slug === post.slug);
  const nextPost = currentIndex > 0 ? allPosts[currentIndex - 1] : null;
  const prevPost = currentIndex < allPosts.length - 1 ? allPosts[currentIndex + 1] : null;

  const structuredData = generateArticleStructuredData({
    headline: post.title,
    description: post.metaDescription,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: post.author,
  });

  const breadcrumbItems = [
    { name: 'Blog', url: '/blog' },
    { name: post.title, url: `/blog/${post.slug}` },
  ];

  return (
    <>
      <StructuredData data={structuredData} />

      <article className="container mx-auto px-4 py-16 max-w-3xl">
        <Breadcrumbs items={breadcrumbItems} className="mb-8" />

        <header className="mb-12">
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
            <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs font-medium">
              {post.category}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(post.publishedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {post.readingTime} min read
            </span>
          </div>

          <h1 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">
            {post.title}
          </h1>

          <p className="text-xl text-muted-foreground">
            {post.excerpt}
          </p>
        </header>

        <div className="prose prose-lg dark:prose-invert max-w-none">
          {post.content.map((section, index) => (
            <section key={index} className="mb-8">
              {section.heading && (
                <h2 className="text-2xl font-bold mt-10 mb-4">{section.heading}</h2>
              )}
              <p className="text-muted-foreground leading-relaxed text-base">
                {section.body}
              </p>
            </section>
          ))}
        </div>

        <div className="border-t mt-16 pt-8">
          <div className="bg-primary/5 rounded-lg p-8 text-center mb-12">
            <h3 className="text-2xl font-bold mb-3">
              Ready to build faster?
            </h3>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              Join thousands of developers generating production-ready applications
              with Zapdev. Multi-framework support, real sandboxes, zero setup.
            </p>
            <Link href="/">
              <Button size="lg">
                Start Building Free
              </Button>
            </Link>
          </div>

          <nav className="flex justify-between items-center">
            {prevPost ? (
              <Link
                href={`/blog/${prevPost.slug}`}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors max-w-[45%]"
              >
                <ArrowLeft className="h-4 w-4 flex-shrink-0" />
                <span className="truncate text-sm">{prevPost.title}</span>
              </Link>
            ) : (
              <div />
            )}
            {nextPost ? (
              <Link
                href={`/blog/${nextPost.slug}`}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors max-w-[45%] text-right"
              >
                <span className="truncate text-sm">{nextPost.title}</span>
                <ArrowRight className="h-4 w-4 flex-shrink-0" />
              </Link>
            ) : (
              <div />
            )}
          </nav>
        </div>
      </article>
    </>
  );
}
