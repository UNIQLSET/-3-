const projectUrl = 'https://vrmdkyvoabifhpzebdet.supabase.co';
const publishableKey = 'sb_publishable_NCdyfda76CMoOoUW9V8hRw_6w-NwEVG';

export async function callAttendance(action, fields = {}) {
  const response = await fetch(`${projectUrl}/functions/v1/attendance-auth`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${publishableKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action, ...fields }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  const data = await response?.json().catch(() => null);
  if (!response?.ok || !data) throw new Error(data?.error || 'unavailable');
  return data;
}
