import { createFileRoute } from '@tanstack/react-router'
import { PricingPageContent } from '@/modules/home/ui/components/pricing-page-content'

export const Route = createFileRoute('/pricing')({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: 'Pricing - Affordable AI Development Plans | Zapdev' },
      { 
        name: 'description', 
        content: 'Choose the perfect plan for your development needs. Start free with Zapdev and scale as you grow. Transparent pricing for individuals and teams.' 
      },
    ],
  }),
})

function PricingPage() {
  return <PricingPageContent />
}
