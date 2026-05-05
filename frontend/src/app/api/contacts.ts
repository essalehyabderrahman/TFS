import { apiRequest } from "./client"

export interface Contact {
  id: string
  contactUserId: string | null
  email: string
  name: string
  displayName: string
  nickname: string | null
  isFavorite: boolean
  isFriend: boolean
  source: "manual" | "sent_to" | "received_from"
  isExternal: boolean
  createdAt: string
}

export interface ContactsResponse {
  favorites: Contact[]
  friends: Contact[]
  sentTo: Contact[]
  receivedFrom: Contact[]
  all: Contact[]
}

export async function fetchContacts(): Promise<{ data: ContactsResponse | null; error: string | null }> {
  try {
    const data = await apiRequest<ContactsResponse>("/contacts")
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? String(err) }
  }
}

export async function addContact(email: string, nickname?: string): Promise<{ data: Contact | null; error: string | null }> {
  try {
    const data = await apiRequest<Contact>("/contacts", {
      method: "POST",
      body: { email, nickname },
    })
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? String(err) }
  }
}

export async function updateContact(
  id: string,
  updates: { isFavorite?: boolean; isFriend?: boolean; nickname?: string }
): Promise<{ data: Contact | null; error: string | null }> {
  try {
    const data = await apiRequest<Contact>(`/contacts/${id}`, {
      method: "PATCH",
      body: updates,
    })
    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err?.message ?? String(err) }
  }
}

export async function deleteContact(id: string): Promise<{ ok: boolean; error: string | null }> {
  try {
    await apiRequest(`/contacts/${id}`, { method: "DELETE" })
    return { ok: true, error: null }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}
