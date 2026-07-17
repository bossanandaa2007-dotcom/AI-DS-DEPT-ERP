import { LogOut, Menu, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { APP_NAVIGATION_ICON, ROLE_LABELS, ROLE_NAVIGATION } from '@/constants/navigation'
import { ROUTE_PATHS } from '@/app/router/route-paths'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import { documentReviewRepository } from '@/services/supabase/documentReviewRepository'

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { currentUser } = useAuth()
  const loadJuryEligibility = useCallback(() => currentUser?.role === 'faculty' ? documentReviewRepository.isCurrentUserJuryEligible() : Promise.resolve(false), [currentUser?.role])
  const juryEligibility = useAsyncResource(loadJuryEligibility)
  if (!currentUser) return null
  const navigationItems = ROLE_NAVIGATION[currentUser.role].filter((item) => item.path !== ROUTE_PATHS.facultyJuryReviews || juryEligibility.data)

  return <nav aria-label="Role navigation" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
    {navigationItems.map(({ label, path, icon: Icon }) => <NavLink end={path === navigationItems[0]?.path} key={path} onClick={onNavigate} to={path} className={({ isActive }) => `flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted hover:bg-background hover:text-text'}`}>
      {Icon && <Icon aria-hidden="true" className="size-4" />} {label}
    </NavLink>)}
  </nav>
}

function Sidebar({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const AppIcon = APP_NAVIGATION_ICON
  return <aside className={`${mobile ? 'h-full' : 'hidden lg:flex lg:w-[var(--sidebar-width)]'} flex-col border-r border-border bg-surface`}>
    <div className="flex h-[var(--header-height)] items-center gap-3 border-b border-border px-5"><span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><AppIcon aria-hidden="true" className="size-4" /></span><span className="text-sm font-bold text-text">AI&amp;DS ERP</span></div>
    <Navigation onNavigate={onNavigate} />
  </aside>
}

export function AppShell() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const navigate = useNavigate()
  const { currentUser, logout } = useAuth()
  if (!currentUser) return null
  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      navigate(ROUTE_PATHS.login, { replace: true })
    }
  }

  return <div className="flex min-h-screen bg-background">
    <Sidebar />
    {isDrawerOpen && <div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Close navigation" className="absolute inset-0 bg-text/40" onClick={() => setIsDrawerOpen(false)} /><div className="relative h-full w-[min(18rem,85vw)] bg-surface shadow-xl"><div className="absolute right-3 top-3"><Button aria-label="Close navigation" variant="ghost" className="px-2" onClick={() => setIsDrawerOpen(false)}><X className="size-5" /></Button></div><Sidebar mobile onNavigate={() => setIsDrawerOpen(false)} /></div></div>}
    <div className="min-w-0 flex-1"><header className="flex h-[var(--header-height)] items-center justify-between border-b border-border bg-surface px-4 sm:px-6"><Button aria-label="Open navigation" variant="ghost" className="px-2 lg:hidden" onClick={() => setIsDrawerOpen(true)}><Menu className="size-5" /></Button><div className="ml-auto flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-semibold text-text">{currentUser.name}</p><Badge tone="primary">{ROLE_LABELS[currentUser.role]}</Badge></div><Button variant="ghost" aria-label="Log out" className="px-2" onClick={() => void handleLogout()}><LogOut className="size-5" /><span className="hidden sm:inline">Logout</span></Button></div></header><main className="app-container py-6 sm:py-8"><Outlet /></main></div>
  </div>
}
