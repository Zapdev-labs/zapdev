import { rootRoute } from './__root'
import { Route as IndexRoute } from './index'
import { Route as PricingRoute } from './pricing'
import { Route as DashboardRoute } from './dashboard'
import { Route as ImportRoute } from './import'
import { Route as TermsRoute } from './terms'
import { Route as PrivacyRoute } from './privacy'
import { Route as ShowcaseRoute } from './showcase'
import { Route as ProjectsProjectIdRoute } from './projects.$projectId'
import { Route as BlogIndexRoute } from './blog.index'
import { Route as BlogSlugRoute } from './blog.$slug'
import { Route as FrameworksIndexRoute } from './frameworks.index'
import { Route as FrameworksSlugRoute } from './frameworks.$slug'
import { Route as SolutionsIndexRoute } from './solutions.index'
import { Route as SolutionsSlugRoute } from './solutions.$slug'
import { Route as NotFoundRoute } from './$'

export const routeTree = rootRoute.addChildren([
  IndexRoute,
  PricingRoute,
  DashboardRoute,
  ImportRoute,
  TermsRoute,
  PrivacyRoute,
  ShowcaseRoute,
  ProjectsProjectIdRoute,
  BlogIndexRoute,
  BlogSlugRoute,
  FrameworksIndexRoute,
  FrameworksSlugRoute,
  SolutionsIndexRoute,
  SolutionsSlugRoute,
  NotFoundRoute,
])
