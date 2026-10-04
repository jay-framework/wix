import {
    makeJayStackComponent,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import { createEffect, createMemo, createSignal, Props } from '@jay-framework/component';
import type {
    ProGalleryContract,
    ProGalleryFastViewState,
    ProGalleryRefs,
} from '../contracts/pro-gallery.jay-contract.js';
import { MediaType } from '../contracts/pro-gallery.jay-contract';
import {
    WIX_PRO_GALLERY_SERVICE,
    type WixProGalleryService,
} from '../services/pro-gallery-service-marker.js';
import type { GalleryItemView } from '../utils/project-gallery-items.js';
import * as nav from '../utils/slideshow.js';

export interface ProGalleryProps {
    galleryId: string;
    autoplay?: boolean | string;
    intervalMs?: number | string;
    loop?: boolean | string;
}

export const DEFAULT_INTERVAL_MS = 4000;

/** jay-html passes literal prop values as strings ("true", "4000"). */
const asBoolean = (value: unknown) => value === true || value === 'true';
const asInterval = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_INTERVAL_MS;
};

type Items = ProGalleryFastViewState['items'];

function toViewItems(items: GalleryItemView[], current: number): Items {
    return items.map((item) => ({
        ...item,
        mediaType: item.mediaType === 'VIDEO' ? MediaType.VIDEO : MediaType.IMAGE,
        isCurrent: item.index === current,
    }));
}

function navigationState(index: number, count: number, loop: boolean, playing: boolean) {
    const state = { index, count, loop };
    return {
        currentIndex: index,
        currentPosition: count ? index + 1 : 0,
        hasPrevious: nav.hasPrevious(state),
        hasNext: nav.hasNext(state),
        isPlaying: playing && count > 1,
    };
}

async function renderFastChanging(props: ProGalleryProps, gallery: WixProGalleryService) {
    const Pipeline = RenderPipeline.for<ProGalleryFastViewState, {}>();
    let items: GalleryItemView[] = [];
    try {
        items = await gallery.getItems(props.galleryId);
    } catch (error) {
        // Silent failure: render an empty gallery rather than failing the page.
        console.error(`[wix-pro-gallery] could not load gallery ${props.galleryId}:`, error);
    }
    return Pipeline.ok(null).toPhaseOutput(() => ({
        viewState: {
            hasItems: items.length > 0,
            itemCount: items.length,
            items: toViewItems(items, 0),
            ...navigationState(0, items.length, asBoolean(props.loop), asBoolean(props.autoplay)),
        },
        carryForward: {},
    }));
}

function ProGalleryInteractive(
    props: Props<ProGalleryProps>,
    refs: ProGalleryRefs,
    viewStateSignals: Signals<ProGalleryFastViewState>,
) {
    const {
        items: [items],
        currentIndex: [initialIndex],
        isPlaying: [initiallyPlaying],
    } = viewStateSignals;
    const loop = () => asBoolean(props.loop?.());
    const count = () => items().length;
    const [index, setIndex] = createSignal(initialIndex());
    const [playing, setPlaying] = createSignal(initiallyPlaying());

    const go = (target: number) => setIndex(nav.select(target, count()));
    refs.nextButton?.onclick(() => go(nav.next({ index: index(), count: count(), loop: loop() })));
    refs.previousButton?.onclick(() =>
        go(nav.previous({ index: index(), count: count(), loop: loop() })),
    );
    refs.playPauseButton?.onclick(() => setPlaying(!playing()));
    refs.items?.selectButton?.onclick(({ viewState }) => go(viewState.index));

    // One timer per (index, playing) state: manual navigation restarts the countdown.
    createEffect(() => {
        const current = index();
        if (!playing() || typeof window === 'undefined') return;
        const state = { index: current, count: count(), loop: loop() };
        if (!nav.shouldKeepPlaying(state)) {
            setPlaying(false);
            return;
        }
        const timer = setTimeout(() => {
            if (document.hidden)
                setIndex(current); // keep the slide while the tab is hidden; retry next tick
            else go(nav.next(state));
        }, asInterval(props.intervalMs?.()));
        return () => clearTimeout(timer);
    });

    const viewItems = createMemo(() =>
        items().map((item) => ({ ...item, isCurrent: item.index === index() })),
    );

    return {
        render: () => ({
            hasItems: count() > 0,
            itemCount: count(),
            items: viewItems(),
            ...navigationState(index(), count(), loop(), playing()),
        }),
    };
}

/**
 * Wix Pro Gallery headless component (design log 33). Items load live from the Pro Gallery API in the fast
 * phase; navigation and autoplay run in the browser.
 */
export const proGallery = makeJayStackComponent<ProGalleryContract>()
    .withProps<ProGalleryProps>()
    .withServices(WIX_PRO_GALLERY_SERVICE)
    .withFastRender(renderFastChanging)
    .withInteractive(ProGalleryInteractive);
