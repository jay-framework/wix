export interface GetCategoriesInput {
    collectionId: string;
}

export interface GetCategoriesOutput {
    categories: Array<{
        _id: string;
        slug: string;
        title: string;
        itemCount: number;
    }>;
}
