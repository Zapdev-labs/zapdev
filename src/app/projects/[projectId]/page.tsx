import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

import { generateMetadata as generateSEOMetadata } from "@/lib/seo";
import { ErrorFallback } from "@/components/error-fallback";

import { ProjectView } from "@/modules/projects/ui/views/project-view";

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{
    projectId: string;
  }>
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { projectId } = await params;

  try {
    const project = await fetchQuery(api.projects.get, {
      projectId: projectId as Id<"projects">
    });

    if (!project) {
      return generateSEOMetadata({
        title: 'Project Not Found',
        description: 'The requested project could not be found.',
        robots: { index: false, follow: false }
      });
    }

    const frameworkName = project.framework.charAt(0) + project.framework.slice(1).toLowerCase();

    return generateSEOMetadata({
      title: `${project.name} - ${frameworkName} Project Built with Zapdev`,
      description: `Explore ${project.name}, a ${frameworkName} application built using Zapdev's AI-powered development platform. See how AI can accelerate your development workflow.`,
      keywords: [
        `${frameworkName} project`,
        'AI-built application',
        'Zapdev project',
        project.name,
        `${frameworkName} example`,
        'code generation'
      ],
      canonical: `/projects/${projectId}`,
      openGraph: {
        title: project.name,
        description: `A ${frameworkName} project built with Zapdev AI`,
        type: 'article',
        images: [{
          url: `/api/og/project/${projectId}`,
          width: 1200,
          height: 630,
          alt: project.name
        }]
      },
      robots: {
        index: true,
        follow: true
      }
    });
  } catch {
    return generateSEOMetadata({
      title: 'Project - Zapdev',
      description: 'View project details and code'
    });
  }
}

const Page = async ({ params }: Props) => {
  const { projectId } = await params;

  // Convex handles data fetching on the client - no prefetching needed
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<p>Loading Project...</p>}>
        <ProjectView projectId={projectId} />
      </Suspense>
    </ErrorBoundary>
  );
};

export default Page;
