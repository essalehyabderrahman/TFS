import { apiRequest } from "./client";

export interface DashboardNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: "info" | "success" | "warning";
  isRead: boolean;
  createdAt: string;
}

export async function fetchNotifications(params: Record<string, any> = {}): Promise<{ notifications: DashboardNotification[]; unreadCount: number; error: string | null }> {
  try {
    const query = new URLSearchParams(params).toString();
    const endpoint = `/notifications${query ? `?${query}` : ""}`;
    const data = await apiRequest<{ notifications: DashboardNotification[]; unreadCount: number }>(endpoint);
    return { ...data, error: null };
  } catch (err) {
    return { notifications: [], unreadCount: 0, error: String(err) };
  }
}

export async function markNotificationRead(id: string): Promise<boolean> {
  try {
    await apiRequest(`/notifications/${id}/read`, { method: "PATCH" });
    return true;
  } catch (err) {
    console.error("Failed to mark notification as read", err);
    return false;
  }
}

export async function markAllNotificationsRead(): Promise<boolean> {
  try {
    await apiRequest(`/notifications/read-all`, { method: "PATCH" });
    return true;
  } catch (err) {
    console.error("Failed to mark all notifications as read", err);
    return false;
  }
}
