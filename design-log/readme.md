# Wix Monorepo Design Log

Design documentation for the Jay Framework Wix integration packages.

## Structure

| #   | Title                                                                                          | Status          |
| --- | ---------------------------------------------------------------------------------------------- | --------------- |
| 01  | [Wix Packages Structure](./01%20-%20wix%20packages%20structure.md)                             | Documentation   |
| 02  | [Product Card Quick Options](./02%20-%20product%20card%20quick%20options.md)                   | Draft           |
| 03  | [Category Pages](./03%20-%20category%20pages.md)                                               | Implemented     |
| 04  | [Price Filter Enhancements](./04%20-%20price%20filter%20enhancements.md)                       | -               |
| 05  | [Wix Data Plugin](./05%20-%20wix-data%20plugin.md)                                             | -               |
| 06  | [Wix Stores V1 Package](./06%20-%20wix-stores-v1%20package.md)                                 | Implemented     |
| 07  | [Wix Cart Shared Package](./07%20-%20wix-cart%20shared%20package.md)                           | -               |
| 08  | [Wix Data List Slow/Fast Rendering](./08%20-%20wix-data%20list%20slow-fast%20rendering.md)     | Draft           |
| 09  | [Wix Data List Field Mapping](./09%20-%20wix-data%20list%20field%20mapping.md)                 | Draft           |
| 10  | [Category-Prefixed Product Routes](./10%20-%20category-prefixed-product-routes.md)             | Draft           |
| 11  | [Category Deep-Linking & Header](./11%20-%20category-deep-linking-and-header.md)               | Draft           |
| 12  | [Two-Option Quick Add](./12%20-%20two-option-quick-add.md)                                     | Draft           |
| 13  | [Product Search Slow Phase Optimization](./13%20-%20product-search-slow-phase-optimization.md) | Draft           |
| 14  | [Option-Based Product Filters](./14%20-%20option-based-product-filters.md)                     | Implemented     |
| 15  | [Mini Cart Drawer](./15%20-%20mini-cart-drawer.md)                                             | Implemented     |
| 16  | [Product Data Extension Fields](./16%20-%20product%20data%20extension%20fields.md)             | Draft           |
| 17  | [Category Products (formerly Related Products)](./17%20-%20related-products.md)                | Implemented     |
| 18  | [Wix Members Package](./18%20-%20wix-members-package.md)                                       | Draft           |
| 19  | [Wix Media Plugin](./19%20-%20wix-media-plugin.md)                                             | Draft           |
| 20  | [Wix BaaS Deployment](./20%20-%20wix-baas-deployment.md)                                       | Draft           |
| 21  | [BaaS Entry Framework Requirements](./21%20-%20baas-entry-framework-requirements.md)           | Draft           |
| 22  | [Wix Deploy Pipeline](./22%20-%20wix-deploy-pipeline.md)                                       | Draft           |
| 23  | [Wix Checkout Redirect](./23%20-%20wix-checkout-redirect.md)                                   | Draft           |
| 24  | [wix-stores Add Menu contribution](./20%20-%20wix-stores-add-menu-contribution.md)             | Execution-ready |
| 25  | [Product Page Head Tags](./25%20-%20product-page-head-tags.md)                                 | Implemented     |
| 26  | [Granular Wix SDK Imports](./26%20-%20granular-wix-sdk-imports.md)                             | Draft           |
| 27  | [Interactive Setup for Wix Plugins](./27%20-%20interactive-setup-for-wix-plugins.md)           | Draft           |
| 28  | [Static Filename Validation for CDN](./28%20-%20static-filename-validation-for-cdn.md)         | Draft           |
| 29  | [App Strategy Support](./29%20-%20app-strategy-support.md)                                     | Draft           |
| 30  | [BaaS Deploy Operations](./30%20-%20baas%20deploy%20operations.md)                             | Implemented     |

## Packages Covered

- `@jay-framework/wix-server-client` - Base Wix SDK client and authentication
- `@jay-framework/wix-stores` - E-commerce components (products, cart, checkout)
- `@jay-framework/wix-data` - Wix Data collections integration

## Design Log Methodology

See the main Jay Framework [design log methodology](../../jay/design-log/readme.md) for guidelines.

### Quick Reference

1. **Before changes**: Check existing design logs
2. **New features**: Create design log first, get approval, then implement
3. **Structure**: Background → Problem → Questions → Design → Implementation Plan → Trade-offs
4. **After implementation**: Append "Implementation Results" section
