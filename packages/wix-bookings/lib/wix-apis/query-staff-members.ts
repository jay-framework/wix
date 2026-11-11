import type { WixClient } from '@wix/sdk';
import { queryAllPages } from './query-all-pages.js';

/** Service-provider staff members, each with the id of its Bookings resource. */
export async function queryStaffMembers(
    client: WixClient,
): Promise<{ id: string; resourceId: string }[]> {
    const staffMembers = await queryAllPages<'staffMembers', { id?: string; resourceId?: string }>(
        client,
        '/bookings/v1/staff-members/query',
        'staffMembers',
    );
    return staffMembers
        .map((member) => ({ id: member.id ?? '', resourceId: member.resourceId ?? '' }))
        .filter((member) => member.id && member.resourceId);
}
