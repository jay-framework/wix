export interface GetItemBySlugInput {
  collectionId: string;
  slug: string;
}

export interface GetItemBySlugOutput {
  item: Record<string, unknown>;
}
