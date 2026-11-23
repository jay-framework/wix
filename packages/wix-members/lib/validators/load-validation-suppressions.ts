import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { PLUGIN_KEY } from './credential-rules';

const DEFAULT_PAGES_BASE = 'src/pages';

export interface JayConfigForCredentials {
    /** `validations.wix-members` from `.jay`, or `{}`. */
    suppressions: Record<string, unknown>;
    /** Absolute pages dir: `.jay` `devServer.pagesBase`, else `<projectRoot>/src/pages`. */
    pagesDir: string;
}

export function loadJayConfigForCredentials(projectRoot: string): JayConfigForCredentials {
    const config = readJayConfig(projectRoot);
    const pagesBase = config?.devServer?.pagesBase;
    return {
        suppressions: config?.validations?.[PLUGIN_KEY] ?? {},
        pagesDir: path.resolve(
            projectRoot,
            typeof pagesBase === 'string' ? pagesBase : DEFAULT_PAGES_BASE,
        ),
    };
}

function readJayConfig(projectRoot: string): any {
    const file = path.join(projectRoot, '.jay');
    if (!fs.existsSync(file)) return undefined;
    const parsed = yaml.load(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : undefined;
}
