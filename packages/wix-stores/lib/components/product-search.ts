import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals,
} from '@jay-framework/fullstack-component';
import { createSignal, createEffect, createMemo, Props } from '@jay-framework/component';
import {
    CategoryHeaderOfProductSearchViewState,
    CurrentSort,
    OptionRenderType,
    ProductSearchContract,
    ProductSearchFastViewState,
    ProductSearchInteractiveViewState,
    ProductSearchParams,
    ProductSearchRefs,
    ProductSearchSlowViewState,
} from '../contracts/product-search.jay-contract';
import { WIX_STORES_SERVICE_MARKER, WixStoresService } from '../services/wix-stores-service.js';
import { patch, REPLACE, ADD } from '@jay-framework/json-patch';
import { searchProducts, getVariantStock } from '../actions/stores-actions';
import { buildCategoryUrl, type VariantStockMap } from '../utils/product-mapper';
import { WIX_STORES_CONTEXT, WixStoresContext } from '../contexts/wix-stores-context';
import { QuickAddType } from '../contracts/product-card.jay-contract';
import { type Category } from '@wix/auto_sdk_categories_categories';
import { formatWixMediaUrl } from '@jay-framework/wix-utils';
import { SearchProductsInput, SearchProductsOutput } from '../actions/search-products.jay-action';

/**
 * Category info carried forward from slow to fast phase
 */
type CategoryInfos = ProductSearchSlowViewState['filters']['categoryFilter']['categories'];

/**
 * Data carried forward from slow rendering to fast rendering
 */
interface SearchSlowCarryForward {
    searchFields: string;
    fuzzySearch: boolean;
    categories: CategoryInfos;
    /** Root category ID when scoped to a category prefix (always applied, hidden from UI) */
    baseCategoryId: string | null;
    /** Pre-loaded product results from slow phase (used when no query params) */
    preloadedResult: SearchProductsOutput | null;
    /** Base option filters from unfiltered search (static list, counts updated per search) */
    baseOptionFilters: SearchProductsOutput['optionFilters'];
}

/**
 * Data carried forward from fast rendering to interactive phase
 */
interface SearchFastCarryForward {
    searchFields: string;
    fuzzySearch: boolean;
    categories: CategoryInfos;
    /** Root category ID when scoped to a category prefix (always applied, hidden from UI) */
    baseCategoryId: string | null;
    /** Base option filters from unfiltered search (static list structure) */
    baseOptionFilters: SearchProductsOutput['optionFilters'];
}

const PAGE_SIZE = 12;

/** Map CurrentSort enum to action sort field */
function mapSortToAction(sort: CurrentSort): SearchProductsInput['sortBy'] {
    switch (sort) {
        case CurrentSort.priceAsc:
            return 'price_asc';
        case CurrentSort.priceDesc:
            return 'price_desc';
        case CurrentSort.newest:
            return 'newest';
        case CurrentSort.nameAsc:
            return 'name_asc';
        case CurrentSort.nameDesc:
            return 'name_desc';
        default:
            return 'relevance';
    }
}

// ============================================================================
// Filter URL Persistence
// ============================================================================

interface ParsedUrlFilters {
    searchTerm: string;
    selectedCategorySlugs: string[];
    minPrice: number | null;
    maxPrice: number | null;
    inStockOnly: boolean;
    sort: string;
    /** Parsed option selections: optionName → Set of selected choice names */
    optionSelections: Map<string, Set<string>>;
}

/**
 * Parse filter state from URL query parameters.
 */
function parseUrlFilters(url: string): ParsedUrlFilters {
    try {
        const params = new URL(url, 'http://x').searchParams;

        // Parse option selections: opt=Color:Red,Blue;Size:M,L
        const optionSelections = new Map<string, Set<string>>();
        const optParam = params.get('opt');
        if (optParam) {
            for (const segment of optParam.split(';')) {
                const colonIdx = segment.indexOf(':');
                if (colonIdx === -1) continue;
                const name = decodeURIComponent(segment.slice(0, colonIdx));
                const choices = segment
                    .slice(colonIdx + 1)
                    .split(',')
                    .map((c) => decodeURIComponent(c))
                    .filter(Boolean);
                if (choices.length > 0) {
                    optionSelections.set(name, new Set(choices));
                }
            }
        }

        return {
            searchTerm: params.get('q') || '',
            selectedCategorySlugs: params.get('cat')?.split(',').filter(Boolean) || [],
            minPrice: params.has('min') ? Number(params.get('min')) : null,
            maxPrice: params.has('max') ? Number(params.get('max')) : null,
            inStockOnly: params.get('inStock') === '1',
            sort: params.get('sort') || 'relevance',
            optionSelections,
        };
    } catch {
        return {
            searchTerm: '',
            selectedCategorySlugs: [],
            minPrice: null,
            maxPrice: null,
            inStockOnly: false,
            sort: 'relevance',
            optionSelections: new Map(),
        };
    }
}

/**
 * Map a sort string to CurrentSort enum.
 */
function parseSortParam(sort: string): CurrentSort {
    const sortMap: Record<string, CurrentSort> = {
        relevance: CurrentSort.relevance,
        priceAsc: CurrentSort.priceAsc,
        priceDesc: CurrentSort.priceDesc,
        newest: CurrentSort.newest,
        nameAsc: CurrentSort.nameAsc,
        nameDesc: CurrentSort.nameDesc,
    };
    return sortMap[sort] ?? CurrentSort.relevance;
}

/**
 * Update URL query parameters from current filter state (client-side only).
 */
function updateUrlFilters(
    searchTerm: string | null,
    filters: ProductSearchFastViewState['filters'],
    sort: CurrentSort,
    categories: CategoryInfos,
): void {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams();

    if (searchTerm) params.set('q', searchTerm);

    // Use slugs for category params, not IDs
    const selectedSlugs = filters.categoryFilter.categories
        .filter((c) => c.isSelected)
        .map((c) => {
            const info = categories.find((cat) => cat.categoryId === c.categoryId);
            return info?.categorySlug;
        })
        .filter(Boolean);
    if (selectedSlugs.length) params.set('cat', selectedSlugs.join(','));

    if (filters.priceRange.minPrice > 0) params.set('min', String(filters.priceRange.minPrice));
    if (
        filters.priceRange.maxPrice > 0 &&
        filters.priceRange.maxPrice < filters.priceRange.maxBound
    ) {
        params.set('max', String(filters.priceRange.maxPrice));
    }
    if (filters.inStockOnly) params.set('inStock', '1');

    // Serialize option filter selections: opt=Color:Red,Blue;Size:M,L
    const optSegments: string[] = [];
    for (const opt of filters.optionFilters || []) {
        const selected = opt.choices
            .filter((c) => c.isSelected)
            .map((c) => encodeURIComponent(c.choiceName));
        if (selected.length > 0) {
            optSegments.push(`${encodeURIComponent(opt.optionName)}:${selected.join(',')}`);
        }
    }
    if (optSegments.length > 0) params.set('opt', optSegments.join(';'));

    if (sort !== CurrentSort.relevance) {
        const sortNames: Record<number, string> = {
            [CurrentSort.priceAsc]: 'priceAsc',
            [CurrentSort.priceDesc]: 'priceDesc',
            [CurrentSort.newest]: 'newest',
            [CurrentSort.nameAsc]: 'nameAsc',
            [CurrentSort.nameDesc]: 'nameDesc',
        };
        const sortName = sortNames[sort];
        if (sortName) params.set('sort', sortName);
    }

    const query = params.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

/**
 * Build option filters view state by merging filtered counts into the base list.
 * Base list structure (options and choices) stays static; counts and isDisabled update.
 */
function buildOptionFiltersViewState(
    baseOptionFilters: SearchProductsOutput['optionFilters'],
    filteredResult: SearchProductsOutput,
    optionSelections: Map<string, Set<string>>,
) {
    // Build lookup from filtered aggregation: choiceName (lowercase) → count
    const filteredChoiceCounts = new Map<string, number>();
    for (const opt of filteredResult.optionFilters || []) {
        for (const ch of opt.choices) {
            filteredChoiceCounts.set(ch.choiceName.toLowerCase(), ch.productCount);
        }
    }

    return baseOptionFilters.map((opt) => ({
        optionId: opt.optionId,
        optionName: opt.optionName,
        optionRenderType:
            opt.optionRenderType === 'SWATCH_CHOICES'
                ? OptionRenderType.SWATCH_CHOICES
                : OptionRenderType.TEXT_CHOICES,
        choices: opt.choices.map((ch) => {
            const count = filteredChoiceCounts.get(ch.choiceName.toLowerCase()) ?? 0;
            return {
                choiceId: ch.choiceId,
                choiceName: ch.choiceName,
                colorCode: ch.colorCode,
                productCount: count,
                isSelected: optionSelections.get(opt.optionName)?.has(ch.choiceName) ?? false,
                isDisabled: count === 0,
            };
        }),
    }));
}

/** Empty category header used as default */
const EMPTY_CATEGORY_HEADER: CategoryHeaderOfProductSearchViewState = {
    name: '',
    description: '',
    imageUrl: '',
    hasImage: false,
    productCount: 0,
    breadcrumbs: [],
    seoData: { tags: [], settings: { preventAutoRedirect: false, keywords: [] } },
};

/**
 * Look up a category by slug via the Wix API.
 */
async function findCategoryBySlug(
    categoriesClient: WixStoresService['categories'],
    slug: string,
): Promise<Category | null> {
    const result = await categoriesClient
        .queryCategories({ treeReference: { appNamespace: '@wix/stores' } })
        .eq('slug', slug)
        .eq('visible', true)
        .limit(1)
        .find();
    return result.items?.[0] ?? null;
}

/**
 * Load category details with DESCRIPTION and BREADCRUMBS_INFO.
 */
async function loadCategoryDetails(
    categoriesClient: WixStoresService['categories'],
    categoryId: string,
): Promise<Category | null> {
    try {
        return await categoriesClient.getCategory(
            categoryId,
            { appNamespace: '@wix/stores' },
            { fields: ['DESCRIPTION', 'BREADCRUMBS_INFO'] },
        );
    } catch {
        return null;
    }
}

/**
 * Build category header from category data, with parent-chain inheritance for missing fields.
 */
async function buildCategoryHeader(
    wixStoreService: WixStoresService,
    category: Category,
    categoryUrlTemplate: string | null,
): Promise<CategoryHeaderOfProductSearchViewState> {
    // Load full details
    const details = await loadCategoryDetails(wixStoreService.categories, category._id);
    const cat = details || category;

    const imageUrl = cat.image ? formatWixMediaUrl('', cat.image) : '';
    const description = cat.description || '';

    // Build breadcrumbs from BREADCRUMBS_INFO + current category
    // The API returns ancestors only, so we append the current category
    const categoryTree = await wixStoreService.getCategoryTree();
    const breadcrumbs = [
        ...(cat.breadcrumbsInfo?.breadcrumbs || []).map((b) => ({
            categoryId: b.categoryId,
            name: b.categoryName,
            slug: b.categorySlug,
            url: categoryUrlTemplate
                ? buildCategoryUrl(wixStoreService.urls, categoryTree, b.categorySlug, b.categoryId)
                : '',
        })),
        {
            categoryId: cat._id || '',
            name: cat.name || '',
            slug: cat.slug || '',
            url: categoryUrlTemplate
                ? buildCategoryUrl(
                      wixStoreService.urls,
                      categoryTree,
                      cat.slug || '',
                      cat._id || '',
                  )
                : '',
        },
    ];

    // Map SEO data
    const seoData = cat.seoData
        ? {
              tags: (cat.seoData.tags || []).map((tag, index: number) => ({
                  position: index.toString().padStart(2, '0'),
                  type: tag.type || '',
                  props: Object.entries(tag.props || {}).map(([key, value]) => ({
                      key,
                      value: value as string,
                  })),
                  meta: Object.entries(tag.meta || {}).map(([key, value]) => ({
                      key,
                      value: value as string,
                  })),
                  children: tag.children || '',
              })),
              settings: {
                  preventAutoRedirect: cat.seoData.settings?.preventAutoRedirect || false,
                  keywords: (cat.seoData.settings?.keywords || []).map((k) => ({
                      term: k.term || '',
                      isMain: k.isMain || false,
                      origin: k.origin || '',
                  })),
              },
          }
        : EMPTY_CATEGORY_HEADER.seoData;

    let header: CategoryHeaderOfProductSearchViewState = {
        name: cat.name || '',
        description,
        imageUrl,
        hasImage: !!imageUrl,
        productCount: cat.itemCounter || 0,
        breadcrumbs,
        seoData,
    };

    // Inherit missing fields from parent chain
    if ((!description || !imageUrl) && cat.parentCategory?._id) {
        const parent = await loadCategoryDetails(
            wixStoreService.categories,
            cat.parentCategory._id,
        );
        if (parent) {
            if (!header.description && parent.description) {
                header = { ...header, description: parent.description };
            }
            if (!header.imageUrl) {
                const parentImage = parent.image ? formatWixMediaUrl('', parent.image) : '';
                if (parentImage) {
                    header = { ...header, imageUrl: parentImage, hasImage: true };
                }
            }
        }
    }

    return header;
}

/**
 * Slow Rendering Phase
 * Loads:
 * - Category header (name, description, image, breadcrumbs, SEO) via fallback chain
 * - Available categories for filtering
 * - Search field configuration
 */
async function renderSlowlyChanging(
    props: PageProps & ProductSearchParams,
    wixStores: WixStoresService,
) {
    const Pipeline = RenderPipeline.for<ProductSearchSlowViewState, SearchSlowCarryForward>();

    // Resolve the active category via fallback chain:
    // 1. category param → 2. prefix param → 3. defaultCategory config
    const categorySlug = props.category ?? null;
    const prefixSlug = props.prefix ?? null;
    const defaultCategorySlug = wixStores.defaultCategory;

    let activeCategory: Category | null = null;
    let baseCategoryId: string | null = null;

    if (categorySlug) {
        activeCategory = await findCategoryBySlug(wixStores.categories, categorySlug);
        baseCategoryId = activeCategory?._id ?? null;
    } else if (prefixSlug) {
        activeCategory = await findCategoryBySlug(wixStores.categories, prefixSlug);
        baseCategoryId = activeCategory?._id ?? null;
    } else if (defaultCategorySlug) {
        activeCategory = await findCategoryBySlug(wixStores.categories, defaultCategorySlug);
        // Don't set baseCategoryId for default — show all products
    }

    // Get category tree (lazily built, cached on service)
    const tree = await wixStores.getCategoryTree();

    // Build category header
    const categoryHeader = activeCategory
        ? await buildCategoryHeader(wixStores, activeCategory, wixStores.urls.category)
        : EMPTY_CATEGORY_HEADER;

    return Pipeline.try(async () => {
        let query = wixStores.categories
            .queryCategories({
                treeReference: { appNamespace: '@wix/stores' },
            })
            .eq('visible', true);

        // When scoped to a category, show only direct children as filters
        if (baseCategoryId) {
            query = query.eq('parentCategory.id', baseCategoryId);
        }

        // Load categories and pre-load default products in parallel
        const baseCategoryIds = baseCategoryId ? [baseCategoryId] : [];
        const [categoriesResult, productsResult] = await Promise.all([
            query.find(),
            searchProducts({
                query: '',
                filters: {
                    categoryIds: baseCategoryIds.length > 0 ? baseCategoryIds : undefined,
                },
                pageSize: PAGE_SIZE,
            }),
        ]);

        return {
            categories: categoriesResult.items || [],
            productsResult,
        };
    })
        .recover((error) => {
            console.error('Failed to load categories/products:', error);
            return Pipeline.ok({
                categories: [] as Category[],
                productsResult: null as SearchProductsOutput | null,
            });
        })
        .toPhaseOutput(({ categories, productsResult }) => {
            const categoryInfos: CategoryInfos = categories.map((cat) => ({
                categoryId: cat._id || '',
                categoryName: cat.name || '',
                categorySlug: cat.slug || '',
                categoryUrl:
                    buildCategoryUrl(wixStores.urls, tree, cat.slug || '', cat._id || '') ?? '',
            }));

            // Extract base option filters from unfiltered preloaded search
            const baseOptionFilters = productsResult?.optionFilters || [];

            return {
                viewState: {
                    searchFields: 'name,description,sku',
                    fuzzySearch: true,
                    emptyStateMessage: 'Enter a search term to find products',
                    filters: {
                        categoryFilter: {
                            categories: categoryInfos,
                        },
                    },
                    categoryHeader,
                },
                carryForward: {
                    searchFields: 'name,description,sku',
                    fuzzySearch: true,
                    categories: categoryInfos,
                    baseCategoryId,
                    preloadedResult: productsResult,
                    baseOptionFilters,
                },
            };
        });
}

/**
 * Fast Rendering Phase
 * Uses pre-loaded products from slow phase when no filters are active.
 * Otherwise fetches fresh with filters/sort/search.
 */
async function renderFastChanging(
    props: PageProps & ProductSearchParams,
    slowCarryForward: SearchSlowCarryForward,
    _wixStores: WixStoresService,
) {
    const Pipeline = RenderPipeline.for<ProductSearchFastViewState, SearchFastCarryForward>();

    // Parse URL query params to restore filter state
    const urlFilters = parseUrlFilters(props.url);
    const initialSort = parseSortParam(urlFilters.sort);

    // Map category slugs from URL to category IDs
    const initialCategoryIds = urlFilters.selectedCategorySlugs
        .map((slug) => slowCarryForward.categories.find((c) => c.categorySlug === slug)?.categoryId)
        .filter(Boolean) as string[];

    // Build initial option filters from URL
    const initialOptionFilters: Array<{ optionName: string; choiceNames: string[] }> = [];
    for (const [optionName, choiceNames] of urlFilters.optionSelections) {
        initialOptionFilters.push({ optionName, choiceNames: [...choiceNames] });
    }

    const hasActiveFilters =
        !!urlFilters.searchTerm ||
        initialCategoryIds.length > 0 ||
        urlFilters.minPrice !== null ||
        urlFilters.maxPrice !== null ||
        urlFilters.inStockOnly ||
        initialSort !== CurrentSort.relevance ||
        initialOptionFilters.length > 0;

    return Pipeline.try(async () => {
        // Use pre-loaded products from slow phase when no filters are active
        if (!hasActiveFilters && slowCarryForward.preloadedResult) {
            return slowCarryForward.preloadedResult;
        }

        // Fetch with filters
        const baseCategoryIds = slowCarryForward.baseCategoryId
            ? [slowCarryForward.baseCategoryId, ...initialCategoryIds]
            : initialCategoryIds;

        const result = await searchProducts({
            query: urlFilters.searchTerm || '',
            filters: {
                categoryIds: baseCategoryIds.length > 0 ? baseCategoryIds : undefined,
                minPrice: urlFilters.minPrice ?? undefined,
                maxPrice: urlFilters.maxPrice ?? undefined,
                inStockOnly: urlFilters.inStockOnly || undefined,
                optionFilters: initialOptionFilters.length > 0 ? initialOptionFilters : undefined,
            },
            sortBy:
                initialSort !== CurrentSort.relevance ? mapSortToAction(initialSort) : undefined,
            pageSize: PAGE_SIZE,
        });

        return result;
    })
        .recover((error) => {
            console.error('Failed to load products:', error);
            return Pipeline.ok({
                products: [],
                totalCount: 0,
                nextCursor: null,
                hasMore: false,
                priceAggregation: {
                    minBound: 0,
                    maxBound: 1000,
                    ranges: [
                        {
                            rangeId: 'all',
                            label: 'Show all',
                            minValue: 0,
                            maxValue: 1000,
                            productCount: 0,
                            isSelected: true,
                        },
                    ],
                },
                optionFilters: [],
            });
        })
        .toPhaseOutput((result) => {
            const priceAgg = result.priceAggregation || {
                minBound: 0,
                maxBound: 1000,
                ranges: [
                    {
                        rangeId: 'all',
                        label: 'Show all',
                        minValue: 0,
                        maxValue: 1000,
                        productCount: result.totalCount,
                        isSelected: true,
                    },
                ],
            };

            return {
                viewState: {
                    searchExpression: urlFilters.searchTerm,
                    isSearching: false,
                    hasSearched: !!urlFilters.searchTerm,
                    searchResults: result.products,
                    resultCount: result.products.length,
                    hasResults: result.products.length > 0,
                    hasSuggestions: false,
                    suggestions: [],
                    filters: {
                        inStockOnly: urlFilters.inStockOnly,
                        priceRange: {
                            minPrice: urlFilters.minPrice ?? priceAgg.minBound,
                            maxPrice: urlFilters.maxPrice ?? priceAgg.maxBound,
                            minBound: priceAgg.minBound,
                            maxBound: priceAgg.maxBound,
                            ranges: priceAgg.ranges.map((r) => ({
                                ...r,
                                minValue: r.minValue ?? 0,
                                maxValue: r.maxValue ?? 0,
                            })),
                        },
                        categoryFilter: {
                            categories: slowCarryForward.categories.map((cat) => ({
                                categoryId: cat.categoryId,
                                isSelected: initialCategoryIds.includes(cat.categoryId),
                            })),
                        },
                        optionFilters: buildOptionFiltersViewState(
                            slowCarryForward.baseOptionFilters,
                            result,
                            urlFilters.optionSelections,
                        ),
                    },
                    sortBy: {
                        currentSort: initialSort,
                    },
                    hasMore: result.hasMore,
                    loadedCount: result.products.length,
                    totalCount: result.totalCount,
                },
                carryForward: {
                    searchFields: slowCarryForward.searchFields,
                    fuzzySearch: slowCarryForward.fuzzySearch,
                    categories: slowCarryForward.categories,
                    baseCategoryId: slowCarryForward.baseCategoryId,
                    baseOptionFilters: slowCarryForward.baseOptionFilters,
                },
            };
        });
}

/**
 * Interactive Phase (Client-Side)
 * Handles user interactions:
 * - Search input and submission
 * - Filtering (categories, price, stock)
 * - Sorting
 * - Load more button
 * - Search suggestions
 *
 * All state updates use immutable patterns with the patch utility.
 */
function ProductSearchInteractive(
    props: Props<PageProps & ProductSearchParams>,
    refs: ProductSearchRefs,
    viewStateSignals: Signals<ProductSearchFastViewState>,
    fastCarryForward: SearchFastCarryForward,
    storesContext: WixStoresContext,
) {
    // Base category filter — always applied when scoped to a category prefix
    const baseCategoryId = fastCarryForward.baseCategoryId;

    // Variant stock maps for COLOR_AND_TEXT_OPTIONS (loaded lazily per product)
    const variantStockCache: Record<string, VariantStockMap> = {};

    const {
        searchExpression: [searchExpression, setSearchExpression],
        isSearching: [isSearching, setIsSearching],
        hasSearched: [hasSearched, setHasSearched],
        searchResults: [searchResults, setSearchResults],
        resultCount: [resultCount, setResultCount],
        hasResults: [hasResults, setHasResults],
        hasSuggestions: [hasSuggestions, setHasSuggestions],
        suggestions: [suggestions, setSuggestions],
        filters: [filters, setFilters],
        sortBy: [sortBy, setSortBy],
        hasMore: [hasMore, setHasMore],
        loadedCount: [loadedCount, setLoadedCount],
        totalCount: [totalCount, setTotalCount],
    } = viewStateSignals;

    // Submitted search term - only updated when search button is clicked
    const [submittedSearchTerm, setSubmittedSearchTerm] = createSignal<string | null>(null);

    // Current cursor for load more (internal state, not in view state)
    let currentCursor: string | null = null;

    let isFirst = true;
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    let searchVersion = 0;
    const DEBOUNCE_MS = 300;

    // Separate signal for search result counts — updated by performSearch without
    // triggering the reactive search effect (which watches `filters` for selections).
    const [latestSearchResult, setLatestSearchResult] = createSignal<SearchProductsOutput | null>(
        null,
    );

    // Merged filters: combines user selections (from `filters`) with live counts
    // (from `latestSearchResult`). Used for rendering only.
    const mergedFilters = createMemo((): ProductSearchFastViewState['filters'] => {
        const f = filters();
        const result = latestSearchResult();
        if (!result) return f;

        // Build current selections map from the filters signal
        const selections = new Map<string, Set<string>>();
        for (const opt of f.optionFilters || []) {
            const selected = opt.choices.filter((c) => c.isSelected).map((c) => c.choiceName);
            if (selected.length > 0) selections.set(opt.optionName, new Set(selected));
        }

        return {
            ...f,
            optionFilters: buildOptionFiltersViewState(
                fastCarryForward.baseOptionFilters,
                result,
                selections,
            ),
        };
    });

    // Perform search (replaces results, resets cursor)
    const performSearch = async (
        version: number,
        searchTerm: string | null,
        currentFilters: ProductSearchFastViewState['filters'],
        currentSort: CurrentSort,
    ) => {
        setIsSearching(true);
        setHasSearched(true);

        try {
            // Combine base category (always active) with user-selected child categories
            const userSelectedCategoryIds = currentFilters.categoryFilter.categories
                .filter((c) => c.isSelected)
                .map((c) => c.categoryId);
            const categoryIds = baseCategoryId
                ? [baseCategoryId, ...userSelectedCategoryIds]
                : userSelectedCategoryIds;

            // Build option filters from current view state
            const activeOptionFilters = (currentFilters.optionFilters || [])
                .map((opt) => ({
                    optionName: opt.optionName,
                    choiceNames: opt.choices.filter((c) => c.isSelected).map((c) => c.choiceName),
                }))
                .filter((o) => o.choiceNames.length > 0);

            const result = await searchProducts({
                query: searchTerm || '',
                filters: {
                    minPrice: currentFilters.priceRange.minPrice || undefined,
                    maxPrice: currentFilters.priceRange.maxPrice || undefined,
                    categoryIds,
                    inStockOnly: currentFilters.inStockOnly,
                    optionFilters: activeOptionFilters.length > 0 ? activeOptionFilters : undefined,
                },
                sortBy: mapSortToAction(currentSort),
                // No cursor = start from beginning
                pageSize: PAGE_SIZE,
            });

            // Check if a newer search was started
            if (version !== searchVersion) {
                return;
            }

            setSearchResults(result.products);
            setResultCount(result.products.length);
            setTotalCount(result.totalCount);
            setLoadedCount(result.products.length);
            setHasMore(result.hasMore);
            setHasResults(result.products.length > 0);

            // Store search result for count merging (via mergedFilters memo)
            setLatestSearchResult(result);

            // Store cursor for load more
            currentCursor = result.nextCursor;

            // Update URL with current filter state
            updateUrlFilters(searchTerm, currentFilters, currentSort, fastCarryForward.categories);
        } catch (error) {
            if (version === searchVersion) {
                console.error('Search failed:', error);
            }
        } finally {
            if (version === searchVersion) {
                setIsSearching(false);
            }
        }
    };

    // Load more (appends results using cursor)
    const performLoadMore = async () => {
        if (isSearching() || !hasMore() || !currentCursor) return;

        setIsSearching(true);

        try {
            const currentFilters = filters();
            const currentSort = sortBy().currentSort;
            const searchTerm = submittedSearchTerm();

            // Combine base category with user-selected child categories
            const userSelectedCategoryIds = currentFilters.categoryFilter.categories
                .filter((c) => c.isSelected)
                .map((c) => c.categoryId);
            const categoryIds = baseCategoryId
                ? [baseCategoryId, ...userSelectedCategoryIds]
                : userSelectedCategoryIds;

            // Build option filters from current view state
            const activeOptionFilters = (currentFilters.optionFilters || [])
                .map((opt) => ({
                    optionName: opt.optionName,
                    choiceNames: opt.choices.filter((c) => c.isSelected).map((c) => c.choiceName),
                }))
                .filter((o) => o.choiceNames.length > 0);

            const result = await searchProducts({
                query: searchTerm || '',
                filters: {
                    minPrice: currentFilters.priceRange.minPrice || undefined,
                    maxPrice: currentFilters.priceRange.maxPrice || undefined,
                    categoryIds,
                    inStockOnly: currentFilters.inStockOnly,
                    optionFilters: activeOptionFilters.length > 0 ? activeOptionFilters : undefined,
                },
                sortBy: mapSortToAction(currentSort),
                cursor: currentCursor,
                pageSize: PAGE_SIZE,
            });

            // Append new products to existing results
            const currentResults = searchResults();
            const newResults = [...currentResults, ...result.products];

            setSearchResults(newResults);
            setResultCount(newResults.length);
            setLoadedCount(newResults.length);
            setHasMore(result.hasMore);

            // Update cursor for next load
            currentCursor = result.nextCursor;
        } catch (error) {
            console.error('Load more failed:', error);
        } finally {
            setIsSearching(false);
        }
    };

    // Reactive search effect - runs when search parameters change
    createEffect(() => {
        const searchTerm = submittedSearchTerm();
        const currentFilters = filters();
        const currentSort = sortBy().currentSort;

        if (isFirst) {
            isFirst = false;
            return;
        }

        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
        }

        debounceTimeout = setTimeout(() => {
            searchVersion++;
            const version = searchVersion;
            performSearch(version, searchTerm, currentFilters, currentSort);
        }, DEBOUNCE_MS);
    });

    // Search input handler
    refs.searchExpression.oninput(({ event }) => {
        const value = (event.target as HTMLInputElement).value;
        setSearchExpression(value);
    });

    // Enter key triggers search
    refs.searchExpression.onkeydown(({ event }) => {
        if ((event as KeyboardEvent).key === 'Enter') {
            event.preventDefault();
            setSubmittedSearchTerm(searchExpression().trim());
        }
    });

    // Search button click
    refs.searchButton.onclick(() => {
        setSubmittedSearchTerm(searchExpression().trim());
    });

    // Clear search button
    refs.clearSearchButton.onclick(() => {
        setSearchExpression('');
        setSubmittedSearchTerm(null);
        setHasSearched(false);
    });

    // Sorting dropdown
    refs.sortBy.sortDropdown.oninput(({ event }) => {
        const value = (event.target as HTMLSelectElement).value;
        const sortMap: Record<string, CurrentSort> = {
            relevance: CurrentSort.relevance,
            priceAsc: CurrentSort.priceAsc,
            priceDesc: CurrentSort.priceDesc,
            newest: CurrentSort.newest,
            nameAsc: CurrentSort.nameAsc,
            nameDesc: CurrentSort.nameDesc,
        };
        const newSort = sortMap[value] ?? CurrentSort.relevance;
        setSortBy({ currentSort: newSort });
    });

    // Price range input filters (works for both number inputs and range sliders)
    refs.filters.priceRange.minPrice.oninput(({ event }) => {
        const value = parseFloat((event.target as HTMLInputElement).value);
        const newValue = isNaN(value) ? 0 : value;
        setFilters(
            patch(filters(), [{ op: REPLACE, path: ['priceRange', 'minPrice'], value: newValue }]),
        );
    });

    refs.filters.priceRange.maxPrice.oninput(({ event }) => {
        const value = parseFloat((event.target as HTMLInputElement).value);
        const newValue = isNaN(value) ? 0 : value;
        setFilters(
            patch(filters(), [{ op: REPLACE, path: ['priceRange', 'maxPrice'], value: newValue }]),
        );
    });

    // Price range radio buttons
    refs.filters.priceRange.ranges.isSelected.oninput(({ event, coordinate }) => {
        const [rangeId] = coordinate;
        const currentFilters = filters();
        const ranges = currentFilters.priceRange.ranges || [];
        const selectedRange = ranges.find((r) => r.rangeId === rangeId);

        if (!selectedRange) return;

        // Update all ranges: deselect all, select the clicked one
        const updatedRanges = ranges.map((r) => ({
            ...r,
            isSelected: r.rangeId === rangeId,
        }));

        // Set min/max based on selected range
        const newMinPrice = selectedRange.minValue ?? 0;
        const newMaxPrice = selectedRange.maxValue ?? 0;

        setFilters(
            patch(currentFilters, [
                { op: REPLACE, path: ['priceRange', 'ranges'], value: updatedRanges },
                { op: REPLACE, path: ['priceRange', 'minPrice'], value: newMinPrice },
                { op: REPLACE, path: ['priceRange', 'maxPrice'], value: newMaxPrice },
            ]),
        );
    });

    // Category filter checkboxes
    refs.filters.categoryFilter.categories.isSelected.oninput(({ event, coordinate }) => {
        const [categoryId] = coordinate;
        const currentFilters = filters();
        const categoryIndex = currentFilters.categoryFilter.categories.findIndex(
            (c) => c.categoryId === categoryId,
        );

        if (categoryIndex !== -1) {
            const isChecked = (event.target as HTMLInputElement).checked;
            setFilters(
                patch(currentFilters, [
                    {
                        op: REPLACE,
                        path: ['categoryFilter', 'categories', categoryIndex, 'isSelected'],
                        value: isChecked,
                    },
                ]),
            );
        }
    });

    // In stock only filter
    refs.filters.inStockOnly.oninput(({ event }) => {
        const isChecked = (event.target as HTMLInputElement).checked;
        setFilters(patch(filters(), [{ op: REPLACE, path: ['inStockOnly'], value: isChecked }]));
    });

    // Option filter choice checkboxes
    refs.filters.optionFilters.choices.isSelected.oninput(({ event, coordinate }) => {
        const [optionId, choiceId] = coordinate;
        const currentFilters = filters();
        const optionIndex = currentFilters.optionFilters.findIndex((o) => o.optionId === optionId);
        if (optionIndex === -1) return;

        const choiceIndex = currentFilters.optionFilters[optionIndex].choices.findIndex(
            (c) => c.choiceId === choiceId,
        );
        if (choiceIndex === -1) return;

        const isChecked = (event.target as HTMLInputElement).checked;
        setFilters(
            patch(currentFilters, [
                {
                    op: REPLACE,
                    path: ['optionFilters', optionIndex, 'choices', choiceIndex, 'isSelected'],
                    value: isChecked,
                },
            ]),
        );
    });

    // Clear filters button
    refs.filters.clearFilters.onclick(() => {
        const currentFilters = filters();
        const clearedCategories = currentFilters.categoryFilter.categories.map((cat) => ({
            ...cat,
            isSelected: false,
        }));

        // Reset price ranges - select "Show all"
        const clearedRanges = (currentFilters.priceRange.ranges || []).map((r, i) => ({
            ...r,
            isSelected: i === 0, // First one is "Show all"
        }));

        // Reset option filter selections
        const clearedOptionFilters = (currentFilters.optionFilters || []).map((opt) => ({
            ...opt,
            choices: opt.choices.map((ch) => ({ ...ch, isSelected: false })),
        }));

        setFilters({
            priceRange: {
                minPrice: 0,
                maxPrice: 0,
                minBound: currentFilters.priceRange.minBound,
                maxBound: currentFilters.priceRange.maxBound,
                ranges: clearedRanges,
            },
            categoryFilter: { categories: clearedCategories },
            inStockOnly: false,
            optionFilters: clearedOptionFilters,
        });
    });

    // Load more button
    refs.loadMoreButton.onclick(() => {
        performLoadMore();
    });

    // Suggestion clicks
    refs.suggestions.suggestionButton.onclick(({ coordinate }) => {
        const [suggestionId] = coordinate;
        const suggestion = suggestions().find((s) => s.suggestionId === suggestionId);
        if (suggestion) {
            setSearchExpression(suggestion.suggestionText);
            setSubmittedSearchTerm(suggestion.suggestionText);
        }
    });

    // Product card add to cart (SIMPLE products)
    refs.searchResults.addToCartButton.onclick(async ({ coordinate }) => {
        const [productId] = coordinate;

        const currentResults = searchResults();
        const productIndex = currentResults.findIndex((p) => p._id === productId);
        if (productIndex === -1) return;

        setSearchResults(
            patch(currentResults, [
                { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: true },
            ]),
        );

        try {
            await storesContext.addToCart(productId, 1);
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            setSearchResults(
                patch(searchResults(), [
                    { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: false },
                ]),
            );
        }
    });

    // Lazy-load variant stock on product card hover (for COLOR_AND_TEXT_OPTIONS)
    const variantStockLoading = new Set<string>();
    const loadVariantStock = async (productId: string) => {
        if (variantStockCache[productId] || variantStockLoading.has(productId)) return;
        variantStockLoading.add(productId);

        try {
            // Update text choice inStock based on currently selected color
            const currentResults = searchResults();
            const productIndex = currentResults.findIndex((p) => p._id === productId);
            if (productIndex === -1) return;

            const product = currentResults[productIndex];

            if (product?.quickAddType !== QuickAddType.COLOR_AND_TEXT_OPTIONS) return;

            const stockMap = await getVariantStock({ productId });
            variantStockCache[productId] = stockMap;

            const selectedColor = product.quickOption?.choices?.find((c) => c.isSelected);
            const textChoices = product.secondQuickOption?.choices;
            if (!selectedColor || !textChoices) return;

            const colorStock = stockMap[selectedColor.choiceId];
            const updatedTextChoices = textChoices.map((c) => ({
                ...c,
                inStock: colorStock?.[c.choiceId] ?? false,
            }));
            setSearchResults(
                patch(searchResults(), [
                    {
                        op: REPLACE,
                        path: [productIndex, 'secondQuickOption', 'choices'],
                        value: updatedTextChoices,
                    },
                ]),
            );
        } finally {
            variantStockLoading.delete(productId);
        }
    };

    refs.searchResults.productLink.onmouseenter(({ coordinate }) => {
        const [productId] = coordinate;
        loadVariantStock(productId);
    });

    refs.searchResults.quickOption.choices.choiceButton.onmouseenter(({ coordinate }) => {
        const [productId] = coordinate;
        loadVariantStock(productId);
    });

    // Quick option choice click
    refs.searchResults.quickOption.choices.choiceButton.onclick(async ({ coordinate }) => {
        const [productId, choiceId] = coordinate;

        const currentResults = searchResults();
        const productIndex = currentResults.findIndex((p) => p._id === productId);
        if (productIndex === -1) return;

        const product = currentResults[productIndex];

        // COLOR_AND_TEXT_OPTIONS: color click toggles selection, does NOT add to cart
        if (product.quickAddType === QuickAddType.COLOR_AND_TEXT_OPTIONS) {
            const choices = product.quickOption?.choices;
            if (!choices) return;
            const updatedChoices = choices.map((c) => ({
                ...c,
                isSelected: c.choiceId === choiceId,
            }));

            // Update color selection
            let updated = patch(currentResults, [
                {
                    op: REPLACE,
                    path: [productIndex, 'quickOption', 'choices'],
                    value: updatedChoices,
                },
            ]);

            // Update text choice inStock from cache (loaded on hover)
            const stockMap = variantStockCache[productId];
            if (stockMap) {
                const colorStock = stockMap[choiceId];
                const textChoices = product.secondQuickOption?.choices;
                if (textChoices) {
                    const updatedTextChoices = textChoices.map((c) => ({
                        ...c,
                        inStock: colorStock?.[c.choiceId] ?? false,
                    }));
                    updated = patch(updated, [
                        {
                            op: REPLACE,
                            path: [productIndex, 'secondQuickOption', 'choices'],
                            value: updatedTextChoices,
                        },
                    ]);
                }
            } else {
                // Fallback: trigger load if hover was missed (e.g. touch devices)
                loadVariantStock(productId);
            }

            setSearchResults(updated);
            return;
        }

        // SINGLE_OPTION: click = add to cart
        const choice = product.quickOption?.choices?.find((c) => c.choiceId === choiceId);

        if (!choice || !choice.inStock) {
            console.warn('Choice not available or out of stock');
            return;
        }

        setSearchResults(
            patch(currentResults, [
                { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: true },
            ]),
        );

        try {
            const optionId = product.quickOption._id;
            await storesContext.addToCart(productId, 1, {
                options: { [optionId]: choice.choiceId },
                modifiers: {},
                customTextFields: {},
            });
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            setSearchResults(
                patch(searchResults(), [
                    { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: false },
                ]),
            );
        }
    });

    // Second quick option choice click (text choices for COLOR_AND_TEXT_OPTIONS)
    refs.searchResults.secondQuickOption.choices.choiceButton.onclick(async ({ coordinate }) => {
        const [productId, choiceId] = coordinate;

        const currentResults = searchResults();
        const productIndex = currentResults.findIndex((p) => p._id === productId);
        if (productIndex === -1) return;

        const product = currentResults[productIndex];
        const textChoice = product.secondQuickOption?.choices?.find((c) => c.choiceId === choiceId);
        const selectedColor = product.quickOption?.choices?.find((c) => c.isSelected);

        if (!textChoice || !textChoice.inStock) {
            console.warn('Text choice not available or out of stock');
            return;
        }

        setSearchResults(
            patch(currentResults, [
                { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: true },
            ]),
        );

        try {
            const colorOptionId = product.quickOption?._id || '';
            const textOptionId = product.secondQuickOption?._id || '';
            await storesContext.addToCart(productId, 1, {
                options: {
                    [colorOptionId]: selectedColor?.choiceId || '',
                    [textOptionId]: textChoice.choiceId,
                },
                modifiers: {},
                customTextFields: {},
            });
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            setSearchResults(
                patch(searchResults(), [
                    { op: REPLACE, path: [productIndex, 'isAddingToCart'], value: false },
                ]),
            );
        }
    });

    refs.searchResults.secondQuickOption.choices.choiceButton.onmouseenter(({ coordinate }) => {
        const [productId] = coordinate;
        loadVariantStock(productId);
    });

    // View options button (NEEDS_CONFIGURATION products)
    refs.searchResults.viewOptionsButton.onclick(({ coordinate }) => {
        const [productId] = coordinate;
        const product = searchResults().find((p) => p._id === productId);
        if (product?.productUrl) {
            window.location.href = product.productUrl;
        }
    });

    return {
        render: (): ProductSearchInteractiveViewState => ({
            searchExpression: searchExpression(),
            isSearching: isSearching(),
            hasSearched: hasSearched(),
            searchResults: searchResults(),
            resultCount: resultCount(),
            hasResults: hasResults(),
            hasSuggestions: hasSuggestions(),
            suggestions: suggestions(),
            filters: mergedFilters(),
            sortBy: sortBy(),
            hasMore: hasMore(),
            loadedCount: loadedCount(),
            totalCount: totalCount(),
        }),
    };
}

/**
 * Product Search Full-Stack Component
 *
 * A complete headless product search component with server-side rendering,
 * filtering, sorting, and "load more" functionality.
 *
 * Rendering phases:
 * - Slow: Categories for filtering (relatively static)
 * - Fast: Products, search results, load more state (dynamic per request)
 * - Interactive: Search input, filter selections, sorting, load more (client-side)
 *
 * Usage:
 * ```typescript
 * import { productSearch } from '@jay-framework/wix-stores';
 * ```
 */
/**
 * Load category slugs for static site generation.
 * Yields all visible categories so the framework can match them
 * against existing filesystem routes.
 *
 * Each category is yielded exactly once:
 * - Root categories (no parent): { prefix: slug }
 * - Child categories (has parent): { prefix: rootParentSlug, category: slug }
 */
async function* loadSearchParams([wixStores]: [WixStoresService]): AsyncIterable<
    ProductSearchParams[]
> {
    try {
        // Load ALL categories by paginating through results
        const allCategories: Category[] = [];
        let result = await wixStores.categories
            .queryCategories({
                treeReference: { appNamespace: '@wix/stores' },
            })
            .eq('visible', true)
            .limit(100)
            .find();

        allCategories.push(...(result.items || []));

        while (result.hasNext()) {
            result = await result.next();
            allCategories.push(...(result.items || []));
        }

        // Build lookup map for walking parent chains
        const categoryById = new Map<string, Category>();
        for (const cat of allCategories) {
            if (cat._id) categoryById.set(cat._id, cat);
        }

        // Walk up the parent chain to find the root ancestor
        function findRootParent(cat: Category): Category | null {
            let current = cat;
            while (current.parentCategory?._id) {
                const parent = categoryById.get(current.parentCategory._id);
                if (!parent) break;
                current = parent;
            }
            return current._id !== cat._id ? current : null;
        }

        // Yield each category exactly once
        const params: ProductSearchParams[] = [];
        for (const cat of allCategories) {
            if (!cat.slug || (cat.itemCounter ?? 0) === 0) continue;

            const rootParent = findRootParent(cat);
            if (rootParent?.slug) {
                params.push({ prefix: rootParent.slug, category: cat.slug });
            } else {
                params.push({ prefix: cat.slug });
            }
        }

        yield params;
    } catch (error) {
        console.error('Failed to load category params:', error);
        yield [];
    }
}

export const productSearch = makeJayStackComponent<ProductSearchContract>()
    .withProps<PageProps & ProductSearchParams>()
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withContexts(WIX_STORES_CONTEXT)
    .withLoadParams(loadSearchParams)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(ProductSearchInteractive);
