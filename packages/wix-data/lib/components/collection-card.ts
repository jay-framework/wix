/**
 * Collection Card Component
 * 
 * Shared component for card widgets showing a single collection item.
 * Receives contract info via props (DynamicContractProps).
 */

import {
    makeJayStackComponent,
    PageProps,
    RenderPipeline,
    DynamicContractProps,
} from '@jay-framework/fullstack-component';
import { WIX_DATA_SERVICE_MARKER, WixDataService } from '../services/wix-data-service';
import {WixDataItem} from "@wix/wix-data-items-sdk/build/cjs/src/data-v2-data-item-items.universal";

/**
 * Props for card widget
 */
interface CardWidgetProps extends PageProps {
    /** Item ID to display */
    itemId?: string;
    
    /** Item slug to display (alternative to itemId) */
    slug?: string;
}

/**
 * Card view state
 */
interface CardViewState {
    _id: string;
    url: string;
    [key: string]: unknown;
}

/**
 * Data carried forward
 */
interface CardCarryForward {
    itemId: string;
}

/**
 * Metadata from dynamic contract generator
 */
interface WixDataMetadata {
    collectionId: string;
}

/**
 * Slow rendering phase
 * Loads the item data for the card
 */
async function renderSlowlyChanging(
    props: CardWidgetProps & DynamicContractProps<WixDataMetadata>,
    wixData: WixDataService
) {
    const { collectionId } = props.metadata!;
    
    const Pipeline = RenderPipeline.for<CardViewState, CardCarryForward>();
    
    return Pipeline
        .try(async () => {
            const config = wixData.getCollectionConfig(collectionId);
            
            if (!config) {
                throw new Error(`Collection not configured: ${collectionId}`);
            }
            
            let item: WixDataItem;
            
            if (props.itemId) {
                // Fetch by ID
                item = await wixData.items.get(collectionId, props.itemId);
            } else if (props.slug) {
                // Fetch by slug
                const result = await wixData.items.query(collectionId)
                    .eq(config.slugField, props.slug)
                    .find();
                item = result.items[0] || null;
            }
            
            if (!item) {
                throw new Error('Item not found');
            }
            
            // Map data fields (filter out system fields, transform images)
            // Note: WixDataItem is a flat object with fields directly on it
            const dataFields = Object.entries(item)
                .filter(([key]) => !key.startsWith('_'))
                .map(([key, value]): [string, unknown] => {
                    if (isImageValue(value)) {
                        return [key, { url: value.src || value.url || '', altText: value.alt || '' }];
                    }
                    return [key, value];
                });
            
            const viewState: CardViewState = {
                _id: item._id!,
                url: `${config.pathPrefix}/${(item as Record<string, unknown>)[config.slugField] || item._id}`,
                ...Object.fromEntries(dataFields)
            };
            
            return { viewState, itemId: item._id! };
        })
        .recover(error => {
            console.error(`[wix-data] Failed to load card item:`, error);
            return Pipeline.clientError(404, 'Item not found');
        })
        .toPhaseOutput(({ viewState, itemId }) => ({
            viewState,
            carryForward: { itemId }
        }));
}

/**
 * Check if a value looks like a Wix image
 */
function isImageValue(value: unknown): value is { src?: string; url?: string; alt?: string } {
    return typeof value === 'object' && value !== null && ('src' in value || 'url' in value);
}

/**
 * Collection Card Full-Stack Component
 * 
 * A shared headless component for card widgets.
 * Displays a single item from a collection in a card format.
 * 
 * Usage:
 * ```html
 * <script type="application/jay-headless"
 *         plugin="@jay-framework/wix-data"
 *         contract="card/BlogPostsCard"
 *         key="featuredPost"
 *         itemId="abc123"
 * ></script>
 * ```
 */
export const collectionCard = makeJayStackComponent<any>()
    .withProps<CardWidgetProps & DynamicContractProps<WixDataMetadata>>()
    .withServices(WIX_DATA_SERVICE_MARKER)
    .withSlowlyRender(renderSlowlyChanging);
