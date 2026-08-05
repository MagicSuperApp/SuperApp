// services/analytics/analyticsApi.ts

import axios, { AxiosInstance } from 'axios';
import { ANALYTICS_API_URL, ANALYTICS_API_KEY } from '@env';
import { AnalyticsEvent } from './types';

/**
 * Client gửi sự kiện hành vi lên Analytics API service
 * (Express + Prisma + PostgreSQL — xem thư mục aladin_analytics_server).
 */
class AnalyticsApiClient {
  private client: AxiosInstance | null;

  constructor() {
    const baseURL = String(ANALYTICS_API_URL ?? '').trim();
    const apiKey = String(ANALYTICS_API_KEY ?? '').trim();

    // ⛔ KHÔNG có đường lui mặc định. Trước đây chỗ này lui về một tunnel ngrok tạm
    // (`https://9bbe-….ngrok-free.app`) kèm khoá `dev-analytics-key` viết cứng — nghĩa là
    // thiếu cấu hình thì mọi bản phát hành ĐỀU gửi hành vi người dùng lên một tên miền
    // tạm mà bất kỳ ai cũng giành lại được. Thiếu cấu hình phải là TẮT, không phải là
    // gửi đi chỗ khác. Cả hai giá trị cũ coi như đã lộ (còn trong lịch sử git) — bên vận
    // hành phải xoay khoá, đừng dùng lại.
    this.client =
      baseURL && apiKey
        ? axios.create({
            baseURL,
            headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
            timeout: 15_000,
          })
        : null;
  }

  /** Có cấu hình để gửi không. Chưa cấu hình ⇒ đo lường tắt hẳn, im lặng. */
  get enabled(): boolean {
    return this.client !== null;
  }

  /**
   * Gửi một batch sự kiện. Ném lỗi nếu thất bại để caller giữ lại trong hàng đợi.
   * Chưa cấu hình thì KHÔNG ném — coi như đã xử lý xong, để hàng đợi không phình mãi.
   */
  async sendBatch(events: AnalyticsEvent[]): Promise<void> {
    if (!events.length || !this.client) return;
    await this.client.post('/api/v1/events/batch', { events });
  }
}

const analyticsApi = new AnalyticsApiClient();
export default analyticsApi;
