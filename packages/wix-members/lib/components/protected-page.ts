import {
    makeJayStackComponent,
    RenderPipeline,
    PageProps,
    RequestCookies,
    redirect3xx,
} from '@jay-framework/fullstack-component';
import {
    ProtectedPageContract,
    ProtectedPageFastViewState,
    ProtectedPageProps,
} from '../contracts/protected-page.jay-contract';
import { WIX_MEMBERS_SERVICE, WixMembersService } from '../services/wix-members-service-marker';
import { AUTH_COOKIE_NAME } from '../utils/auth-cookie.js';

interface ProtectedPageFastCarryForward {}

type FastProps = PageProps & ProtectedPageProps & RequestCookies;

async function renderFastChanging(props: FastProps, _membersService: WixMembersService) {
    const Pipeline = RenderPipeline.for<
        ProtectedPageFastViewState,
        ProtectedPageFastCarryForward
    >();

    const authRole = props.cookies[AUTH_COOKIE_NAME];
    if (authRole !== 'member') {
        const loginUrl = props.loginUrl || '/login';
        return redirect3xx(302, loginUrl);
    }

    return Pipeline.ok(null).toPhaseOutput(() => ({
        viewState: {
            isLoggedIn: true,
        },
        carryForward: {},
        responseHeaders: { 'Cache-Control': 'no-store' },
    }));
}

export const protectedPage = makeJayStackComponent<ProtectedPageContract>()
    .withProps<FastProps>()
    .withServices(WIX_MEMBERS_SERVICE)
    .withFastRender(renderFastChanging);
