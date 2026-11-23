import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import { WIX_MEMBERS_CONTEXT } from '@jay-framework/wix-members/client';

export const page = makeJayStackComponent()
    .withProps()
    .withContexts(WIX_MEMBERS_CONTEXT)
    .withInteractive((props, refs, members) => {
        refs.form.onsubmit(() => members.register('', ''));
        return { render: () => ({}) };
    });
