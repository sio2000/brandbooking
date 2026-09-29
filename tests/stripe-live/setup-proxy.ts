import { routeStripeThroughProxy } from './proxy'

// Every live test reaches api.stripe.com through the sandbox's proxy when one is set.
routeStripeThroughProxy()
