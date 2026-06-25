import {
    makeJayStackComponent,
    RenderPipeline,
    Signals,
    PageProps,
} from '@jay-framework/fullstack-component';
import { Props } from '@jay-framework/component';
import {
    LoginIndicatorContract,
    LoginIndicatorFastViewState,
    LoginIndicatorRefs,
} from '../contracts/login-indicator.jay-contract';
import { WIX_MEMBERS_SERVICE, WixMembersService } from '../services/wix-members-service-marker';
import { WIX_MEMBERS_CONTEXT, WixMembersContext } from '../contexts/wix-members-context';

interface LoginIndicatorFastCarryForward {}

async function renderFastChanging(_props: PageProps, _membersService: WixMembersService) {
    const Pipeline = RenderPipeline.for<
        LoginIndicatorFastViewState,
        LoginIndicatorFastCarryForward
    >();

    return Pipeline.ok(null).toPhaseOutput(() => ({
        viewState: {
            isLoggedIn: false,
            memberName: '',
            memberAvatar: '',
            isLoading: true,
        },
        carryForward: {},
    }));
}

function LoginIndicatorInteractive(
    _props: Props<PageProps>,
    refs: LoginIndicatorRefs,
    _viewStateSignals: Signals<LoginIndicatorFastViewState>,
    _carryForward: LoginIndicatorFastCarryForward,
    membersContext: WixMembersContext,
) {
    refs.loginButton?.onclick(async () => {
        const url = await membersContext.redirectToLogin();
        window.location.href = url;
    });

    refs.logoutButton?.onclick(() => {
        membersContext.logout();
    });

    return {
        render: () => ({
            isLoggedIn: membersContext.memberIndicator.isLoggedIn(),
            memberName: membersContext.memberIndicator.memberName(),
            memberAvatar: membersContext.memberIndicator.memberAvatar(),
            isLoading: membersContext.memberIndicator.isLoading(),
        }),
    };
}

export const loginIndicator = makeJayStackComponent<LoginIndicatorContract>()
    .withProps<PageProps>()
    .withServices(WIX_MEMBERS_SERVICE)
    .withContexts(WIX_MEMBERS_CONTEXT)
    .withFastRender(renderFastChanging)
    .withInteractive(LoginIndicatorInteractive);
