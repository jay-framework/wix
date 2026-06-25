import {
    makeJayStackComponent,
    RenderPipeline,
    Signals,
    PageProps,
} from '@jay-framework/fullstack-component';
import { Props, createEffect } from '@jay-framework/component';
import {
    AuthCallbackContract,
    AuthCallbackFastViewState,
    AuthCallbackRefs,
} from '../contracts/auth-callback.jay-contract';
import { WIX_MEMBERS_SERVICE, WixMembersService } from '../services/wix-members-service-marker';
import { WIX_MEMBERS_CONTEXT, WixMembersContext } from '../contexts/wix-members-context';

interface AuthCallbackFastCarryForward {}

async function renderFastChanging(_props: PageProps, _membersService: WixMembersService) {
    const Pipeline = RenderPipeline.for<AuthCallbackFastViewState, AuthCallbackFastCarryForward>();

    return Pipeline.ok(null).toPhaseOutput(() => ({
        viewState: {
            isProcessing: true,
            hasError: false,
            errorMessage: '',
        },
        carryForward: {},
    }));
}

function AuthCallbackInteractive(
    _props: Props<PageProps>,
    _refs: AuthCallbackRefs,
    viewStateSignals: Signals<AuthCallbackFastViewState>,
    _carryForward: AuthCallbackFastCarryForward,
    membersContext: WixMembersContext,
) {
    const {
        isProcessing: [, setIsProcessing],
        hasError: [hasError, setHasError],
        errorMessage: [errorMessage, setErrorMessage],
    } = viewStateSignals;

    createEffect(() => {
        membersContext.handleAuthCallback().then((result) => {
            setIsProcessing(false);

            if (result.success) {
                window.location.href = result.redirectTo;
            } else {
                setHasError(true);
                setErrorMessage(result.error || 'Authentication failed.');
            }
        });
    });

    return {
        render: () => ({
            isProcessing: !hasError(),
            hasError: hasError(),
            errorMessage: errorMessage(),
        }),
    };
}

export const authCallback = makeJayStackComponent<AuthCallbackContract>()
    .withProps<PageProps>()
    .withServices(WIX_MEMBERS_SERVICE)
    .withContexts(WIX_MEMBERS_CONTEXT)
    .withFastRender(renderFastChanging)
    .withInteractive(AuthCallbackInteractive);
