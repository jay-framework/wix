# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a monorepo containing Jay Framework packages for Wix integrations. Jay Framework is a full-stack web framework built on headless components, contracts, and a multi-phase rendering model. This repo provides:

- **Packages**: Reusable Wix integration packages (`@jay-framework/wix-*`)
- **Examples**: Complete applications demonstrating the packages (whisky-exchange, store, cms, etc.)

## Package Manager & Workspaces

- Uses **Yarn 4** (`yarn@4.12.0`) as the package manager
- Configured as a Yarn workspace with packages in: `packages/**`, `examples/**`, `exploration/**`, `dev-environment`
- Requires Node.js >= 20.0.0

## Common Commands

### Building

```bash
# Build all packages (uses wsrun to run build in all workspaces)
yarn build

# Build and watch for changes (only @jay-framework packages)
yarn build:watch

# Build with esbuild
yarn build:esbuild

# Type check only (no build artifacts)
yarn build:check-types
```

### Testing & Validation

```bash
# Run all tests
yarn test

# Full validation: rebuild, type check, test, format
yarn confirm
```

### Formatting

```bash
# Format all code (runs extensions fix + prettier)
yarn format

# Fix TypeScript import extensions
yarn format:extensions

# Run prettier only
yarn format:prettier
```

### Cleaning

```bash
# Clean all dist folders
yarn clean

# Remove all node_modules
yarn clean:node_modules

# Clean with cache
yarn clean:node_modules:with-cache

# Full rebuild
yarn rebuild
```

### Package Management

```bash
# Upgrade dependencies interactively
yarn deps:upgrade

# Deduplicate dependencies
yarn deduplicate

# Version all packages (patch/minor/major)
yarn version:packages:patch
yarn version:packages:minor
yarn version:packages:major

# Publish packages
yarn publish
```

### Individual Package Commands

Each package has its own build system. Example for `packages/wix-stores`:

```bash
cd packages/wix-stores

# Build package (clean, generate definitions, build client+server, copy contracts, types)
npm run build

# Generate .jay-action and .jay-contract TypeScript definitions
npm run definitions

# Build client bundle
npm run build:client

# Build server bundle (SSR)
npm run build:server

# Copy contract and action files to dist
npm run build:copy-contract

# Generate TypeScript type definitions
npm run build:types

# Type check
npm run build:check-types
```

### Example Applications

Examples use `jay-stack-cli` for development. Example for `examples/whisky-exchange`:

```bash
cd examples/whisky-exchange

# Setup project (creates agent-kit with materialized contracts)
npm run setup

# Generate agent-kit documentation
npm run agent-kit

# Start development server
npm run dev

# Validate jay-html pages against contracts
npm run validate

# Generate TypeScript definitions for source files
npm run definitions

# Build (definitions only, full build not implemented)
npm run build

# Type check
npm run build:check-types
```

## Architecture

### Jay Framework Concepts

**Plugins** provide headless components (data + interactions, no UI):

- Defined by `plugin.yaml` in each package
- Export contracts, actions, and component implementations
- Examples: `@jay-framework/wix-stores`, `@jay-framework/wix-cart`, `@jay-framework/wix-data`

**Contracts** (`.jay-contract` files) define component data shapes:

- Define tags with types: `data`, `variant`, `interactive`, `sub-contract`
- Specify rendering phases: `slow` (build-time/SSG), `fast` (request-time/SSR), `fast+interactive` (SSR + client)
- Used by jay-html templates to bind to component state

**Actions** (`.jay-action` files) define server-side data operations:

- Declarative schema for input/output
- Can import contracts for type reuse
- Examples: `searchProducts`, `getProductBySlug`, `getCategories`

**Jay-HTML** templates (`.jay-html` files):

- HTML-like syntax with data binding: `{variable}`, `{nested.path}`
- Conditionals: `<div if="condition">`, `<div if="!condition">`
- Loops: `<div forEach="items" trackBy="id">`
- Component binding: `<script type="application/jay-headless" plugin="..." contract="..." key="...">`
- Refs for interactions: `<button ref="component.action">`

### Packages Structure

All packages follow similar structure:

```
packages/wix-*/
├── lib/                      # Source files
│   ├── actions/              # .jay-action files (server actions)
│   ├── contracts/            # .jay-contract files (component definitions)
│   ├── components/           # Component implementations (.ts)
│   ├── contexts/             # React/dependency injection contexts
│   ├── services/             # Business logic services
│   ├── utils/                # Utilities
│   ├── init.ts               # Plugin initialization
│   ├── setup.ts              # Setup/validation handlers
│   ├── index.ts              # Server exports
│   └── index.client.ts       # Client exports
├── dist/                     # Built output
├── plugin.yaml               # Plugin definition
├── package.json
├── tsconfig.json
└── vite.config.ts            # Vite build configuration
```

### Key Packages

**`@jay-framework/wix-server-client`**: Core Wix SDK client and authentication

- Manages Wix API token and SDK initialization
- Provides `WixClientService` and `WixClientContext`
- Used by all other Wix packages

**`@jay-framework/wix-stores`**: Wix Stores integration (legacy products API)

- Contracts: `product-page`, `product-search`, `category-page`, `category-list`
- Actions: `searchProducts`, `getProductBySlug`, `getCategories`
- Uses legacy `@wix/stores` and `@wix/categories` SDK modules

**`@jay-framework/wix-stores-v1`**: Wix Stores integration (v1 catalog API)

- Similar contracts to `wix-stores` but uses newer `@wix/stores` v1 API
- Better support for collections vs categories

**`@jay-framework/wix-cart`**: Shopping cart functionality

- Contracts: `cart-page`, `cart-indicator`
- Shared by both `wix-stores` and `wix-stores-v1`
- Client-side cart state management

**`@jay-framework/wix-data`**: Dynamic Wix Data collections

- Generates contracts at build time based on collection schemas
- Actions: `queryItems`, `getItemBySlug`, `getCategories`
- Used for CMS-like content (recipes, articles, etc.)

**`@jay-framework/wix-utils`**: Shared utilities

- Media URL helpers
- Common Wix types and utilities

### Example Applications

Examples demonstrate real-world usage:

- `whisky-exchange`: Full e-commerce site with AI chat (uses wix-stores-v1 + gemini-agent-plugin)
- `whisky-store`: Similar to whisky-exchange
- `store`: E-commerce demo (uses wix-stores)
- `store-light`: Minimal store example
- `studio-store`: Store with Studio integration
- `cms`: Content site using wix-data for recipes and product lines

Each example has an `agent-kit/` directory created by `jay-stack-cli setup`:

- Contains materialized contracts from all plugins
- Documentation files: INSTRUCTIONS.md, jay-html-syntax.md, routing.md, etc.
- Used for AI-assisted development and validation

### Build System

- **Vite** for building client and server bundles
- **esbuild/tsup** for TypeScript compilation
- **wsrun** for running commands across workspaces in parallel
- **jay-cli** for generating `.jay-action` and `.jay-contract` TypeScript definitions

Each package builds:

1. TypeScript definitions for contracts/actions (`definitions` script)
2. Client bundle (browser code) via `vite build`
3. Server bundle (SSR code) via `vite build --ssr`
4. Type definitions via `tsup`
5. Copies `.jay-contract` and `.jay-action` files to dist

### Development Workflow

When making changes to packages:

1. Make changes in `packages/*/lib/`
2. **Read the plugin development guides** in [`agent-kit/plugin/`](agent-kit/plugin/INSTRUCTIONS.md) — covers contracts, headless components, server actions, services, and plugin structure
3. Run `npm run build` in the package (or `yarn build` at root)
4. Type definitions (`.d.ts`) are generated for `.jay-action` and `.jay-contract` files
5. Changes propagate to examples via workspace dependencies

When working on examples:

1. Run `npm run setup` to regenerate agent-kit with latest contracts
2. Use the per example agent-kit designer role
3. Edit `.jay-html` files in `src/pages/`
4. Run `npm run validate` to check against contracts
5. Run `npm run dev` to test locally

### Sync Script

`sync-jay-packages.cjs` is a utility to copy built packages from a local Jay Framework repo:

- Usage: `node sync-jay-packages.cjs [path-to-jay-repo]`
- Copies only `dist/` contents, preserves `package.json`
- Useful for development against unreleased Jay Framework changes

## File Types

- `.jay-html`: HTML templates with Jay Framework bindings
- `.jay-contract`: Component contract definitions (YAML)
- `.jay-action`: Server action definitions (YAML)
- `.jay-contract.d.ts`: TypeScript types for contracts (generated)
- `.jay-action.d.ts`: TypeScript types for actions (generated)
- `plugin.yaml`: Plugin manifest (contracts, actions, components)

## TypeScript Configuration

All packages use TypeScript 5.3+ with strict mode. Examples may use TypeScript 5.7.
Key tsconfig settings:

- `type: "module"` in package.json (ESM only)
- `moduleResolution: "bundler"`
- Strict type checking enabled

## Design Log Methodology

This project follows a rigorous design log methodology for all significant features and architectural changes. Design logs are located in `./design-log/`.

### Before Making Changes

1. **Check design logs** in `./design-log/` for existing designs and implementation notes
2. **Read `design-log/readme.md`** to find relevant design logs by topic
3. **For new features**: Create design log first, get approval, then implement
4. **Read related design logs** to understand context and constraints

### When Creating Design Logs

1. **Structure**: Background → Problem → Questions and Answers → Design → Implementation Plan → Examples → Trade-offs
2. **Be specific**: Include file paths, type signatures, validation rules
3. **Show examples**: Use ✅/❌ for good/bad patterns, include realistic code
4. **Explain why**: Don't just describe what, explain rationale and trade-offs
5. **Ask Questions (in the file)**: For anything that is not clear, or missing information
6. **When answering questions**: Keep the questions, just add answers
7. **Be brief**: Write short explanations and only what is most relevant
8. **Draw Diagrams**: Use mermaid inline diagrams when it makes sense
9. **Define verification criteria**: How do we know the implementation solves the original problem

### When Implementing

1. **Follow the implementation plan** phases from the design log
2. **Write tests first** or update existing tests to match new behavior
3. **Do not update design log** initial section once implementation started
4. **Append design log** with "Implementation Results" section as you go
5. **Document deviations**: Explain why implementation differs from design
6. **Run tests**: Include test results (X/Y passing) in implementation notes
7. **After Implementation**: Add a summary of deviations from original design

### On User Feedback

1. **Assess feedback type**: Clarification → answer directly; Bug → fix or design log; Feature → evaluate design log need; Implementation issue → append to existing log
2. **Append to existing design log** if: relates to in-progress work, missed constraint, implementation deviation, or refines existing design
3. **Create new design log** if: new feature, multi-component change, architectural challenge, or affects multiple design logs
4. **Ask clarifying questions** when: goal unclear, scope ambiguous, trade-offs exist, or missing context
5. **Proceed directly** when: feedback specific and actionable, solution straightforward, no significant trade-offs
6. **When uncertain**: State assumptions, propose options (quick fix vs. proper solution), ask for preference

### Design Log Index

- Maintain `./design-log/readme.md` with a table of design logs by number, title, and status
- Before reading: Check readme.md first to find relevant design logs
- After creating/updating: Add new entries to the table

### Existing Design Logs

The `./design-log/` directory contains documentation for:

- 01: Wix Packages Structure
- 02: Product Card Quick Options
- 03: Category Pages
- 04: Price Filter Enhancements
- 05: Wix Data Plugin
- 06: Wix Stores V1 Package
- 07: Wix Cart Shared Package
- 08: Wix Data List Slow/Fast Rendering
- 09: Wix Data List Field Mapping

## Testing Standards

This project follows fixture-based testing with external files.

### Fixture-Based Testing

**Use External Fixture Files**:

- Store inputs and expected outputs in separate files, not inline in tests
- Makes comparison and debugging easier (can diff files directly)
- Enables IDE syntax highlighting for fixture content
- Structure: `test/fixtures/<feature-name>/` with files like `input.jay-html`, `expected-output.jay-html`, `contract.yaml`, `slow-view-state.json`

**Contracts in YAML Format**:

- Use `.yaml` extension for contract fixtures
- Parse contracts using `parseContract()` to validate they're correct
- Use `checkValidationErrors()` to surface parsing errors in tests

Example:

```typescript
// ✅ Good
const contractYaml = await readFile(path.join(dir, 'contract.yaml'), 'utf-8');
const contract = checkValidationErrors(parseContract(contractYaml, 'contract.yaml'));

// ❌ Bad - inline JSON, no validation
const contract = { name: 'Test', tags: [...] };
```

### Assertions

**Use `toEqual` for Full File Comparisons**:

- When generating complete files, use `toEqual` with formatting
- Do NOT use `toContain` for full file outputs

```typescript
// ✅ Good - exact comparison with formatting
expect(prettifyHtml(result)).toEqual(prettifyHtml(expected));

// ❌ Bad - partial matching hides issues
expect(result).toContain('<div class="foo">');
```

**Use Existing Formatting Utilities**:

- Use `prettifyHtml` from `@jay-framework/compiler-shared` for HTML
- Don't create custom normalization functions when utilities exist

### Test Structure

**Extract Element Creations as Functions**:

- Avoid `beforeEach` + `container.appendChild` pattern
- Create helper functions that return elements for direct assertions

**Consolidate Similar Tests**:

- Merge tests that only differ by input data
- Use test.each or parameterized helpers for variations

**Test Missing/Edge Cases Explicitly**:

- Add dedicated tests for missing data, undefined values
- Follow the runtime's "silent failure" pattern (render undefined, don't throw)

### File Organization

**Mirror Source Structure**:

- Test files in `test/` directory mirroring `lib/` structure
- Fixtures in `test/fixtures/<feature>/`

**One Test File Per Module**:

- Each source module has a corresponding test file
- Name: `<module-name>.test.ts`
