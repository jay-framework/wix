import { WixClient } from '@wix/sdk';
import { redirects } from '@wix/redirects';
import { BuildDescriptors } from '@wix/sdk-types';

let redirectsInstance: BuildDescriptors<typeof redirects, {}> | undefined;

export function getRedirectsClient(wixClient: WixClient): BuildDescriptors<typeof redirects, {}> {
    if (!redirectsInstance) {
        redirectsInstance = wixClient.use(redirects);
    }
    return redirectsInstance;
}
