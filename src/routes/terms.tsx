import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/terms')({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: 'Terms of Service - Zapdev' },
      { name: 'description', content: 'Zapdev Terms of Service' },
    ],
  }),
})

function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
      <div className="prose max-w-none">
        <p className="text-lg text-muted-foreground mb-6">
          Last updated: {new Date().toLocaleDateString()}
        </p>
        <p>Welcome to Zapdev. By using our services, you agree to these terms.</p>
        <h2 className="text-2xl font-semibold mt-8 mb-4">1. Acceptance of Terms</h2>
        <p>By accessing and using Zapdev, you accept and agree to be bound by these Terms.</p>
      </div>
    </div>
  )
}
