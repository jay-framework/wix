export interface ListSlotsInput {
  serviceId: string;
  serviceType: 'APPOINTMENT' | 'CLASS';
  timezone?: string;
  windowDays?: number;
}

export interface ListSlotsOutput {
  slots: Array<{
      id: string;
      localStartDate: string;
      localEndDate: string;
      label: string;
      scheduleId?: string;
      eventId?: string;
      serviceType: 'APPOINTMENT' | 'CLASS';
    }>;
}