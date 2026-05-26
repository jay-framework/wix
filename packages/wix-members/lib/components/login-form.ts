import {
    makeJayStackComponent,
    RenderPipeline,
    Signals,
    PageProps,
} from '@jay-framework/fullstack-component';
import { Props } from '@jay-framework/component';
import {
    LoginFormContract,
    LoginFormFastViewState,
    LoginFormRefs,
} from '../contracts/login-form.jay-contract';
import { WIX_MEMBERS_SERVICE, WixMembersService } from '../services/wix-members-service-marker';
import { WIX_MEMBERS_CONTEXT, WixMembersContext } from '../contexts/wix-members-context';

interface LoginFormFastCarryForward {}

async function renderFastChanging(_props: PageProps, _membersService: WixMembersService) {
    const Pipeline = RenderPipeline.for<LoginFormFastViewState, LoginFormFastCarryForward>();

    return Pipeline.ok(null).toPhaseOutput(() => ({
        viewState: {
            isSubmitting: false,
            errorMessage: '',
            hasError: false,
            resetSent: false,
        },
        carryForward: {},
    }));
}

function LoginFormInteractive(
    _props: Props<PageProps>,
    refs: LoginFormRefs,
    viewStateSignals: Signals<LoginFormFastViewState>,
    _carryForward: LoginFormFastCarryForward,
    membersContext: WixMembersContext,
) {
    const {
        isSubmitting: [isSubmitting, setIsSubmitting],
        hasError: [hasError, setHasError],
        errorMessage: [errorMessage, setErrorMessage],
        resetSent: [resetSent, setResetSent],
    } = viewStateSignals;

    function getInputValue(ref: typeof refs.emailInput): string {
        let value = '';
        ref.exec$((el) => {
            value = el.value;
        });
        return value;
    }

    refs.submitButton.onclick(async () => {
        const email = getInputValue(refs.emailInput);
        const password = getInputValue(refs.passwordInput);

        if (!email || !password) {
            setHasError(true);
            setErrorMessage('Please enter both email and password.');
            return;
        }

        setIsSubmitting(true);
        setHasError(false);
        setErrorMessage('');
        setResetSent(false);

        try {
            const result = await membersContext.login(email, password);

            if (result.success) {
                setIsSubmitting(false);
            } else {
                setIsSubmitting(false);
                setHasError(true);
                setErrorMessage(result.errorMessage || 'Login failed.');
            }
        } catch {
            setIsSubmitting(false);
            setHasError(true);
            setErrorMessage('An unexpected error occurred.');
        }
    });

    refs.forgotPasswordButton?.onclick(async () => {
        const email = getInputValue(refs.emailInput);

        if (!email) {
            setHasError(true);
            setErrorMessage('Please enter your email address first.');
            return;
        }

        setHasError(false);
        setErrorMessage('');

        try {
            await membersContext.sendPasswordResetEmail(email);
            setResetSent(true);
        } catch {
            setHasError(true);
            setErrorMessage('Failed to send password reset email.');
        }
    });

    return {
        render: () => ({
            isSubmitting: isSubmitting(),
            errorMessage: errorMessage(),
            hasError: hasError(),
            resetSent: resetSent(),
        }),
    };
}

export const loginForm = makeJayStackComponent<LoginFormContract>()
    .withProps<PageProps>()
    .withServices(WIX_MEMBERS_SERVICE)
    .withContexts(WIX_MEMBERS_CONTEXT)
    .withFastRender(renderFastChanging)
    .withInteractive(LoginFormInteractive);
