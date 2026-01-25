/**
 * Collection Table Component
 * 
 * Shared component for table widgets showing collection data.
 * Receives contract via DYNAMIC_CONTRACT_SERVICE.
 */

import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    Signals,
    SlowlyRenderResult,
    DYNAMIC_CONTRACT_SERVICE,
    DynamicContractMetadata,
} from '@jay-framework/fullstack-component';
import { Props, createSignal } from '@jay-framework/component';
import { WIX_DATA_SERVICE_MARKER, WixDataService } from '../services/wix-data-service';
import { WIX_DATA_CONTEXT, WixDataContext } from '../contexts/wix-data-context';
import { CollectionConfig } from '../config/config-types';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Props for table widget
 */
interface TableWidgetProps extends PageProps {
    pageSize?: number;
}

/**
 * Column definition for table
 */
interface TableColumn {
    fieldName: string;
    label: string;
    sortable: boolean;
}

/**
 * Row data for table
 */
interface TableRow {
    _id: string;
    url: string;
    cells: Array<{
        fieldName: string;
        value: string;
    }>;
}

/**
 * Slow view state for table widget
 */
interface TableSlowViewState {
    columns: TableColumn[];
    rows: TableRow[];
    totalCount: number;
    pageSize: number;
    totalPages: number;
}

/**
 * Fast view state for table widget
 */
interface TableFastViewState {
    currentPage: number;
    hasPrev: boolean;
    hasNext: boolean;
    sortField: string | null;
    sortDirection: 'ASC' | 'DESC' | 'NONE';
}

/**
 * Data carried forward from slow to fast rendering
 */
interface TableSlowCarryForward {
    collectionId: string;
    columns: string[];
    pageSize: number;
    totalCount: number;
}

/**
 * Data carried forward from fast to interactive
 */
interface TableFastCarryForward {
    collectionId: string;
    columns: string[];
    pageSize: number;
    totalCount: number;
}

/**
 * Derive collection ID from contract name
 * "BlogPostsTable" -> "BlogPosts"
 */
function deriveCollectionId(contractName: string): string {
    return contractName.replace(/Table$/, '');
}

/**
 * Slow rendering phase
 * Loads initial table data and column definitions
 */
async function renderSlowlyChanging(
    props: TableWidgetProps,
    wixData: WixDataService,
    contractMeta: DynamicContractMetadata
) {
    const collectionId = deriveCollectionId(contractMeta.contractName);
    const pageSize = props.pageSize || DEFAULT_PAGE_SIZE;
    
    const Pipeline = RenderPipeline.for<TableSlowViewState, TableSlowCarryForward>();
    
    return Pipeline
        .try(async () => {
            const config = wixData.getCollectionConfig(collectionId);
            
            if (!config) {
                throw new Error(`Collection not configured: ${collectionId}`);
            }
            
            // Fetch collection schema for column definitions
            const schemaResponse = await wixData.collections.getDataCollection(collectionId);
            const schema = schemaResponse.collection;
            
            // Build column definitions from schema
            const columns: TableColumn[] = [];
            const columnNames: string[] = [];
            
            for (const field of schema?.fields || []) {
                // Skip system and complex fields
                if (field.key?.startsWith('_')) continue;
                if (field.type === 'REFERENCE' || field.type === 'MULTI_REFERENCE') continue;
                if (field.type === 'RICH_TEXT' || field.type === 'RICH_CONTENT') continue;
                if (field.type === 'IMAGE' || field.type === 'VIDEO') continue;
                
                columns.push({
                    fieldName: field.key || '',
                    label: field.displayName || field.key || '',
                    sortable: ['TEXT', 'NUMBER', 'DATE', 'DATETIME'].includes(field.type || '')
                });
                columnNames.push(field.key || '');
            }
            
            // Fetch first page of data
            const result = await wixData.queryCollection(collectionId)
                .limit(pageSize)
                .find();
            
            // Map items to rows
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rows: TableRow[] = result.items.map((item: any) => ({
                _id: item._id!,
                url: `${config.pathPrefix}/${item.data?.[config.slugField] || item._id}`,
                cells: columnNames.map(fieldName => ({
                    fieldName,
                    value: formatCellValue(item.data?.[fieldName])
                }))
            }));
            
            const totalCount = result.totalCount || rows.length;
            const totalPages = Math.ceil(totalCount / pageSize);
            
            return {
                columns,
                rows,
                totalCount,
                pageSize,
                totalPages,
                columnNames
            };
        })
        .recover(error => {
            console.error(`[wix-data] Failed to load table data:`, error);
            return Pipeline.clientError(500, 'Failed to load table data');
        })
        .toPhaseOutput(data => ({
            viewState: {
                columns: data.columns,
                rows: data.rows,
                totalCount: data.totalCount,
                pageSize: data.pageSize,
                totalPages: data.totalPages
            },
            carryForward: {
                collectionId,
                columns: data.columnNames,
                pageSize: data.pageSize,
                totalCount: data.totalCount
            }
        }));
}

/**
 * Format a cell value for display
 */
function formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (value instanceof Date) return value.toLocaleDateString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/**
 * Fast rendering phase
 * Sets up pagination and sorting state
 */
async function renderFastChanging(
    props: TableWidgetProps,
    slowCarryForward: TableSlowCarryForward,
    _wixData: WixDataService,
    _contractMeta: DynamicContractMetadata
) {
    const Pipeline = RenderPipeline.for<TableFastViewState, TableFastCarryForward>();
    
    return Pipeline.ok({
        currentPage: 1,
        hasPrev: false,
        hasNext: slowCarryForward.totalCount > slowCarryForward.pageSize,
        sortField: null,
        sortDirection: 'NONE' as const
    }).toPhaseOutput(viewState => ({
        viewState,
        carryForward: slowCarryForward
    }));
}

/**
 * Interactive phase (client-side)
 * Handles pagination and sorting
 */
function TableInteractive(
    _props: Props<TableWidgetProps>,
    refs: any,
    viewStateSignals: Signals<TableFastViewState>,
    fastCarryForward: TableFastCarryForward,
    wixData: WixDataContext
) {
    const {
        currentPage: [currentPage, setCurrentPage],
        hasPrev: [hasPrev, setHasPrev],
        hasNext: [hasNext, setHasNext],
        sortField: [sortField, setSortField],
        sortDirection: [sortDirection, setSortDirection]
    } = viewStateSignals;
    
    const { collectionId, pageSize, totalCount } = fastCarryForward;
    const totalPages = Math.ceil(totalCount / pageSize);
    
    const [rows, setRows] = createSignal<TableRow[]>([]);
    const [isLoading, setIsLoading] = createSignal(false);
    
    // Fetch page data
    async function fetchPage(page: number) {
        setIsLoading(true);
        
        try {
            const result = await wixData.queryItems(collectionId, {
                limit: pageSize,
                // Note: Would need to implement offset/skip in context
            });
            
            // Update rows
            const newRows = result.items.map(item => ({
                _id: item._id,
                url: `/${collectionId.toLowerCase()}/${item._id}`,
                cells: fastCarryForward.columns.map(fieldName => ({
                    fieldName,
                    value: formatCellValue(item.data[fieldName])
                }))
            }));
            
            setRows(newRows);
            setCurrentPage(page);
            setHasPrev(page > 1);
            setHasNext(page < totalPages);
            
        } catch (error) {
            console.error('[wix-data] Failed to fetch page:', error);
        } finally {
            setIsLoading(false);
        }
    }
    
    // Previous page button
    refs.prevButton?.onclick(() => {
        if (hasPrev() && !isLoading()) {
            fetchPage(currentPage() - 1);
        }
    });
    
    // Next page button
    refs.nextButton?.onclick(() => {
        if (hasNext() && !isLoading()) {
            fetchPage(currentPage() + 1);
        }
    });
    
    // Column header click for sorting
    refs.columns?.headerButton?.onclick(({ coordinate }: { coordinate: [string] }) => {
        const [fieldName] = coordinate;
        
        if (sortField() === fieldName) {
            // Toggle direction
            const newDirection = sortDirection() === 'ASC' ? 'DESC' : 
                                 sortDirection() === 'DESC' ? 'NONE' : 'ASC';
            setSortDirection(newDirection);
            if (newDirection === 'NONE') {
                setSortField(null);
            }
        } else {
            // New sort field
            setSortField(fieldName);
            setSortDirection('ASC');
        }
        
        // Re-fetch with new sort
        fetchPage(1);
    });
    
    return {
        render: () => ({
            currentPage: currentPage(),
            hasPrev: hasPrev(),
            hasNext: hasNext(),
            sortField: sortField(),
            sortDirection: sortDirection()
        })
    };
}

/**
 * Collection Table Full-Stack Component
 * 
 * A shared headless component for table widgets.
 * Provides sortable columns and pagination.
 */
export const collectionTable = makeJayStackComponent<any>()
    .withProps<TableWidgetProps>()
    .withServices(WIX_DATA_SERVICE_MARKER, DYNAMIC_CONTRACT_SERVICE)
    .withContexts(WIX_DATA_CONTEXT)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging)
    .withInteractive(TableInteractive);
