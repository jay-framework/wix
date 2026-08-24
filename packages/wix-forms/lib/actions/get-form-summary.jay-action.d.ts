export interface GetFormSummaryInput {
  formId?: string;
}

export interface GetFormSummaryOutput {
  fields: Array<{
      target: string;
      label: string;
      type: 'STRING' | 'EMAIL' | 'PHONE' | 'NUMBER' | 'URL';
      required: boolean;
    }>;
}