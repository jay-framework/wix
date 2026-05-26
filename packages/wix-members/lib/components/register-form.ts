import {
    makeJayStackComponent,
    RenderPipeline,
    Signals,
    PageProps,
} from '@jay-framework/fullstack-component';
import { Props } from '@jay-framework/component';
import {
    RegisterFormContract,
    RegisterFormFastViewState,
    RegisterFormRefs,
} from '../contracts/register-form.jay-contract';
import { WIX_MEMBERS_SERVICE, WixMembersService } from '../services/wix-members-service-marker';
import { WIX_MEMBERS_CONTEXT, WixMembersContext } from '../contexts/wix-members-context';

interface RegisterFormFastCarryForward {}

async function renderFastChanging(_props: PageProps, _membersService: WixMembersService) {
    const Pipeline = RenderPipeline.for<RegisterFormFastViewState, RegisterFormFastCarryForward>();

    return Pipeline.ok(null).toPhaseOutput(() => ({
        viewState: {
            isSubmitting: false,
            errorMessage: '',
            hasError: false,
            isPending: false,
            isSuccess: false,
        },
        carryForward: {},
    }));
}

function RegisterFormInteractive(
    _props: Props<PageProps>,
    refs: RegisterFormRefs,
    viewStateSignals: Signals<RegisterFormFastViewState>,
    _carryForward: RegisterFormFastCarryForward,
    membersContext: WixMembersContext,
) {
    const {
        isSubmitting: [isSubmitting, setIsSubmitting],
        hasError: [hasError, setHasError],
        errorMessage: [errorMessage, setErrorMessage],
        isPending: [isPending, setIsPending],
        isSuccess: [isSuccess, setIsSuccess],
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

        const firstName = getInputValue(refs.firstNameInput) || undefined;
        const lastName = getInputValue(refs.lastNameInput) || undefined;
        const profile = firstName || lastName ? { firstName, lastName } : undefined;

        setIsSubmitting(true);
        setHasError(false);
        setErrorMessage('');
        setIsPending(false);
        setIsSuccess(false);

        try {
            const result = await membersContext.register(email, password, profile);

            setIsSubmitting(false);

            if (result.success) {
                setIsSuccess(true);
            } else if (result.requiresOwnerApproval) {
                setIsPending(true);
            } else if (result.requiresEmailVerification) {
                setIsSuccess(true);
            } else {
                setHasError(true);
                setErrorMessage(result.errorMessage || 'Registration failed.');
            }
        } catch {
            setIsSubmitting(false);
            setHasError(true);
            setErrorMessage('An unexpected error occurred.');
        }
    });

    return {
        render: () => ({
            isSubmitting: isSubmitting(),
            errorMessage: errorMessage(),
            hasError: hasError(),
            isPending: isPending(),
            isSuccess: isSuccess(),
        }),
    };
}

export const registerForm = makeJayStackComponent<RegisterFormContract>()
    .withProps<PageProps>()
    .withServices(WIX_MEMBERS_SERVICE)
    .withContexts(WIX_MEMBERS_CONTEXT)
    .withFastRender(renderFastChanging)
    .withInteractive(RegisterFormInteractive);
