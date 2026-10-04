import { makeJayStackComponent, phaseOutput, PageProps } from '@jay-framework/fullstack-component';
import type { SiteHeaderContract } from './site-header.jay-contract';

/**
 * Shared Atelier site header.
 *
 * A purely structural design-system element: it owns no data of its own and
 * composes the wix-cart `cart-indicator` plugin widget for the live cart count.
 */
export const siteHeader = makeJayStackComponent<SiteHeaderContract>()
    .withProps<PageProps>()
    .withFastRender(async () => phaseOutput({}, {}));
