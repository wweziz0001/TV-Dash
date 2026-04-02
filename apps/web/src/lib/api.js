const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";
const TOKEN_STORAGE_KEY = "tv-dash-token";
export function getStoredToken() {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}
export function setStoredToken(token) {
    if (!token) {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        return;
    }
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}
async function request(path, init = {}, token) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(init.headers ?? {}),
        },
    });
    if (response.status === 204) {
        return undefined;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.message ?? "Request failed");
    }
    return payload;
}
export const api = {
    login: (payload) => request("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
    }),
    me: (token) => request("/auth/me", { method: "GET" }, token),
    listChannels: (token, params) => request(`/channels${params ? `?${params.toString()}` : ""}`, {}, token),
    getChannelBySlug: (slug, token) => request(`/channels/slug/${slug}`, {}, token),
    createChannel: (payload, token) => request("/channels", { method: "POST", body: JSON.stringify(payload) }, token),
    updateChannel: (id, payload, token) => request(`/channels/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token),
    deleteChannel: (id, token) => request(`/channels/${id}`, { method: "DELETE" }, token),
    listGroups: (token) => request("/groups", {}, token),
    createGroup: (payload, token) => request("/groups", { method: "POST", body: JSON.stringify(payload) }, token),
    updateGroup: (id, payload, token) => request(`/groups/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token),
    deleteGroup: (id, token) => request(`/groups/${id}`, { method: "DELETE" }, token),
    listFavorites: (token) => request("/favorites", {}, token),
    addFavorite: (channelId, token) => request("/favorites", { method: "POST", body: JSON.stringify({ channelId }) }, token),
    removeFavorite: (channelId, token) => request(`/favorites/${channelId}`, { method: "DELETE" }, token),
    listLayouts: (token) => request("/layouts", {}, token),
    createLayout: (payload, token) => request("/layouts", { method: "POST", body: JSON.stringify(payload) }, token),
    updateLayout: (id, payload, token) => request(`/layouts/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token),
    deleteLayout: (id, token) => request(`/layouts/${id}`, { method: "DELETE" }, token),
    testStream: (url, token) => request("/streams/test", { method: "POST", body: JSON.stringify({ url }) }, token),
    getStreamMetadata: (url, token) => request(`/streams/metadata?${new URLSearchParams({ url }).toString()}`, {}, token),
};
