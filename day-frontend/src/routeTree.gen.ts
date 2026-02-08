import { Route as rootRoute } from './routes/__root'
import { Route as IndexRoute } from './routes/index'
import { Route as PropertiesIndexRoute } from './routes/properties/index'
import { Route as PropertiesNewRoute } from './routes/properties/new'
import { Route as PropertiesPropertyIdRoute } from './routes/properties/$propertyId'
import { Route as PropertiesGanttRoute } from './routes/properties/gantt'

const IndexRouteWithChildren = IndexRoute.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRoute,
} as any)

const PropertiesIndexRouteWithChildren = PropertiesIndexRoute.update({
  id: '/properties/',
  path: '/properties/',
  getParentRoute: () => rootRoute,
} as any)

const PropertiesNewRouteWithChildren = PropertiesNewRoute.update({
  id: '/properties/new',
  path: '/properties/new',
  getParentRoute: () => rootRoute,
} as any)

const PropertiesPropertyIdRouteWithChildren = PropertiesPropertyIdRoute.update({
  id: '/properties/$propertyId',
  path: '/properties/$propertyId',
  getParentRoute: () => rootRoute,
} as any)

const PropertiesGanttRouteWithChildren = PropertiesGanttRoute.update({
  id: '/properties/gantt',
  path: '/properties/gantt',
  getParentRoute: () => rootRoute,
} as any)

export const routeTree = rootRoute.addChildren([
  IndexRouteWithChildren,
  PropertiesIndexRouteWithChildren,
  PropertiesNewRouteWithChildren,
  PropertiesPropertyIdRouteWithChildren,
  PropertiesGanttRouteWithChildren,
] as any)
