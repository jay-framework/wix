// Serve entry (DL#179): compiler-free. Tools-time surfaces — the validator, setup, agent-kit, CLI
// commands, the devOnly settings actions (DL#180), and the devOnly settings route component — are
// moved to ./tools. The following helpers are compiler-free and remain part of the public API.
export { generateMediaIndex } from './index-generator.js';

export { buildMediaAddMenuItems, thumbnailUrlForMedia } from './add-menu/media-items.js';
export {
    writeGeneratedAddMenuCatalog,
    ADD_MENU_GENERATED_REL,
} from './add-menu/write-add-menu-catalog.js';
export { refreshMediaAddMenuCatalog } from './add-menu/refresh-media-add-menu.js';
