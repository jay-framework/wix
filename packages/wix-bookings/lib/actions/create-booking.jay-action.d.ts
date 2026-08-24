export interface CreateBookingInput {
  serviceId: string;
  serviceType: 'APPOINTMENT' | 'CLASS';
  slot: {
    localStartDate: string;
    localEndDate: string;
    scheduleId?: string;
    eventId?: string;
  };
  timezone: string;
  siteOrigin: string;
  paymentPreference?: 'ONLINE' | 'OFFLINE';
}

export interface CreateBookingOutput {
  outcome: 'confirmed' | 'redirect';
  redirectUrl?: string;
}
