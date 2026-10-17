import { lazy } from 'react';

export const LazyCustomerUpdatesPage = lazy(() =>
  import('../components/CustomerUpdatesPage').then((m) => ({ default: m.CustomerUpdatesPage }))
);

export const LazyFollowupCenterPage = lazy(() =>
  import('../components/FollowupCenterPage').then((m) => ({ default: m.FollowupCenterPage }))
);

export const LazyContactListsPage = lazy(() =>
  import('../campaigns/ContactListsPage').then((m) => ({ default: m.ContactListsPage }))
);

export const LazyCampaignsPage = lazy(() =>
  import('../campaigns/CampaignsPage').then((m) => ({ default: m.CampaignsPage }))
);

export const LazySharedPhoneDirectoryAdminPanel = lazy(() =>
  import('../components/SharedPhoneDirectoryAdminPanel').then((m) => ({
    default: m.SharedPhoneDirectoryAdminPanel,
  }))
);

export const LazyIntegrationFoundationPage = lazy(() =>
  import('../components/dashboard/pages/IntegrationFoundationPage').then((m) => ({
    default: m.IntegrationFoundationPage,
  }))
);

export const LazyLiveMonitorPage = lazy(() =>
  import('../components/dashboard/pages/LiveMonitorPage').then((m) => ({
    default: m.LiveMonitorPage,
  }))
);

export const LazyFeaturesPage = lazy(() =>
  import('../components/FeaturesPage').then((m) => ({ default: m.FeaturesPage }))
);

export const LazyPricingPage = lazy(() =>
  import('../components/PricingPage').then((m) => ({ default: m.PricingPage }))
);

export const LazyHelpDocs = lazy(() => import('../components/HelpDocs'));

export const LazyPublicHomePage = lazy(() =>
  import('../components/PublicHomePage').then((m) => ({ default: m.PublicHomePage }))
);

export const LazyBlogLandingPage = lazy(() =>
  import('../components/blog/BlogLandingPage').then((m) => ({ default: m.BlogLandingPage }))
);

export const LazyBlogArticlePage = lazy(() =>
  import('../components/blog/BlogArticlePage').then((m) => ({ default: m.BlogArticlePage }))
);

export const LazyBlogNotFoundPage = lazy(() =>
  import('../components/blog/BlogArticlePage').then((m) => ({ default: m.BlogNotFoundPage }))
);

export const LazySeoLandingPage = lazy(() =>
  import('../components/seo/SeoLandingPage').then((m) => ({ default: m.SeoLandingPage }))
);

export const LazyProtectedDashboardApplication = lazy(() =>
  import('../app/ProtectedDashboardApplication')
);

export const LazyPublicIntegrationsPage = lazy(() =>
  import('../components/PublicIntegrationsPage').then((m) => ({ default: m.PublicIntegrationsPage }))
);

export const LazyWorkspacesPage = lazy(() =>
  import('../workspaces/WorkspacesPage').then((m) => ({ default: m.WorkspacesPage }))
);

