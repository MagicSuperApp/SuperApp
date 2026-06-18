// services/analytics/analyticsApi.ts

import axios, { AxiosInstance } from 'axios';
import { ANALYTICS_API_URL, ANALYTICS_API_KEY } from '@env';
import { AnalyticsEvent } from './types';

/**
 * Client gửi sự kiện hành vi lên Analytics API service
 * (Express + Prisma + PostgreSQL — xem thư mục aladin_analytics_server).
 */
class AnalyticsApiClient {
  private client: AxiosInstance;

  constructor() {
    const baseURL = ANALYTICS_API_URL || 'https://9bbe-2402-800-619d-78f4-81b6-2212-8137-d9bf.ngrok-free.app/';
    const apiKey = ANALYTICS_API_KEY || 'dev-analytics-key';

    this.client = axios.create({
      baseURL,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    });
  }

  /**
   * Gửi một batch sự kiện. Ném lỗi nếu thất bại để caller giữ lại trong hàng đợi.
   */
  async sendBatch(events: AnalyticsEvent[]): Promise<void> {
    if (!events.length) return;
    await this.client.post('/api/v1/events/batch', { events });
  }
}

const analyticsApi = new AnalyticsApiClient();
export default analyticsApi;
