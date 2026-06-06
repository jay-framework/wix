export interface GetCollectionsInput {}

export type GetCollectionsOutput = Array<{
    _id: string;
    name: string;
    slug: string;
    description: string;
    imageUrl: string;
    productCount: number;
  }>;