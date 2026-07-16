import { createBrowserRouter } from 'react-router-dom'

import { routeConfig } from '@/app/router/route-config'

export { ROUTE_PATHS } from '@/app/router/route-paths'
export type { RoutePath } from '@/app/router/route-paths'

export const appRouter = createBrowserRouter(routeConfig)
