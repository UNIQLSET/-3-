const projectUrl = 'https://vrmdkyvoabifhpzebdet.supabase.co';
const publishableKey = 'sb_publishable_NCdyfda76CMoOoUW9V8hRw_6w-NwEVG';

export async function callAttendance(action, fields = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${projectUrl}/functions/v1/attendance-auth`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action, ...fields }),
      signal: controller.signal,
    }).catch(() => { throw new Error('network_error'); });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new Error(data?.error || 'unavailable');
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
