import { createBrowserRouter } from 'react-router-dom'
import { RequireAuth } from './RequireAuth'
import { RequireRole } from './RequireRole'
import { PublicLayout } from '../layouts/PublicLayout'
import { AppLayout } from '../layouts/AppLayout'
import { SeniorLayout } from '../layouts/SeniorLayout'
import { AdminLayout } from '../layouts/AdminLayout'
import { LandingPage } from '../pages/landing/LandingPage'
import { PricingPage } from '../pages/landing/PricingPage'
import { AuthPage } from '../pages/auth/AuthPage'
import { OnboardingPage } from '../pages/onboarding/OnboardingPage'
import { AcceptGuardianInvitePage } from '../pages/invites/AcceptGuardianInvitePage'
import { GuardianDashboardPage } from '../pages/guardian/GuardianDashboardPage'
import { SeniorHomePage } from '../pages/senior/SeniorHomePage'
import { PartnerTasksPage } from '../pages/partner/PartnerTasksPage'
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'pricing', element: <PricingPage /> },
      { path: 'auth', element: <AuthPage /> },
      { path: 'onboarding', element: <OnboardingPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: 'invite/guardian',
        element: <AcceptGuardianInvitePage />,
      },
      {
        element: (
          <RequireRole
            anyOf={['guardian']}
            allowEmptyRoles
          />
        ),
        children: [
          {
            path: 'guardian',
            element: <AppLayout />,
            children: [{ path: 'dashboard', element: <GuardianDashboardPage /> }],
          },
        ],
      },
      {
        element: <RequireRole anyOf={['senior', 'guardian']} />,
        children: [
          {
            path: 'senior',
            element: <SeniorLayout />,
            children: [{ path: 'home', element: <SeniorHomePage /> }],
          },
        ],
      },
      {
        element: <RequireRole anyOf={['partner']} />,
        children: [
          {
            path: 'partner',
            element: <AppLayout />,
            children: [{ path: 'tasks', element: <PartnerTasksPage /> }],
          },
        ],
      },
      {
        element: <RequireRole anyOf={['admin']} />,
        children: [
          {
            path: 'admin',
            element: <AdminLayout />,
            children: [{ index: true, element: <AdminDashboardPage /> }],
          },
        ],
      },
    ],
  },
])
