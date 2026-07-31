// Thin fetch wrapper around the REST API.
const API = (() => {
  async function req(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
    return data;
  }

  return {
    // events
    listEvents: (from, to) => req('GET', `/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    createEvent: (e) => req('POST', '/api/events', e),
    updateEvent: (id, e) => req('PUT', `/api/events/${id}`, e),
    deleteEvent: (id) => req('DELETE', `/api/events/${id}`),
    // calendars
    listCalendars: () => req('GET', '/api/settings/calendars'),
    createCalendar: (c) => req('POST', '/api/settings/calendars', c),
    updateCalendar: (id, c) => req('PUT', `/api/settings/calendars/${id}`, c),
    deleteCalendar: (id) => req('DELETE', `/api/settings/calendars/${id}`),
    // settings
    getSettings: () => req('GET', '/api/settings'),
    saveSettings: (s) => req('PUT', '/api/settings', s),
    appInfo: () => req('GET', '/api/app-info'),
    // subscriptions (ICS URL)
    listSubscriptions: () => req('GET', '/api/subscriptions'),
    addSubscription: (s) => req('POST', '/api/subscriptions', s),
    refreshSubscription: (id) => req('POST', `/api/subscriptions/${id}/refresh`),
    deleteSubscription: (id) => req('DELETE', `/api/subscriptions/${id}`),
    // google
    googleStatus: () => req('GET', '/api/google/status'),
    googleSaveCreds: (c) => req('POST', '/api/google/credentials', c),
    googleAuthUrl: () => req('GET', '/api/google/auth-url'),
    googleSync: () => req('POST', '/api/google/sync'),
    googleDisconnect: () => req('POST', '/api/google/disconnect'),
  };
})();
