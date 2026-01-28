# Wix Monorepo Design Log

Design documentation for the Jay Framework Wix integration packages.

## Structure

| # | Title | Status |
|---|-------|--------|
| 01 | [Wix Packages Structure](./01%20-%20wix%20packages%20structure.md) | Documentation |
| 02 | [Product Card Quick Options](./02%20-%20product%20card%20quick%20options.md) | Draft |
| 03 | [Category Pages](./03%20-%20category%20pages.md) | Implemented |
| 04 | [Price Filter Enhancements](./04%20-%20price%20filter%20enhancements.md) | - |
| 05 | [Wix Data Plugin](./05%20-%20wix-data%20plugin.md) | - |
| 06 | [Wix Stores V1 Package](./06%20-%20wix-stores-v1%20package.md) | Implemented |

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
