export interface ListServicesInput {}

export interface ListServicesOutput {
  services: Array<{
      id: string;
      name: string;
      type: 'APPOINTMENT' | 'CLASS';
      description: string;
      priceLabel: string;
      durationLabel: string;
      formId?: string;
    }>;
}
