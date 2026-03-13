const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function toISO(date: Date) {
  return date.toISOString()
}

export function buildUrl(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(`${BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined) url.searchParams.set(k, String(v))
  })
  return url.toString()
}

export function rangeParams(hours: number) {
  const end   = new Date()
  const start = new Date(end.getTime() - hours * 3600 * 1000)
  return { start: toISO(start), end: toISO(end) }
}

// SWR fetcher
export const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    return r.json()
  })

// Endpoint builders
export const api = {
  gpu: {
    latest:  ()                              => buildUrl('/api/gpu/latest'),
    history: (hours: number, gpuIndex = 0)  => buildUrl('/api/gpu/history', { ...rangeParams(hours), gpu_index: gpuIndex }),
    indexes: ()                              => buildUrl('/api/gpu/indexes'),
  },
  node: {
    latest:       ()           => buildUrl('/api/node/latest'),
    history:      (hours: number) => buildUrl('/api/node/history', rangeParams(hours)),
    snmpLatest:   ()           => buildUrl('/api/node/snmp/latest'),
    snmpHistory:  (hours: number) => buildUrl('/api/node/snmp/history', rangeParams(hours)),
  },
  network: {
    interfaces: ()                              => buildUrl('/api/network/interfaces'),
    latest:     ()                              => buildUrl('/api/network/latest'),
    history:    (hours: number, iface: string)  => buildUrl('/api/network/history', { ...rangeParams(hours), interface: iface }),
  },
  disk: {
    latest:      ()                                    => buildUrl('/api/disk/latest'),
    history:     (hours: number, mountpoint: string)   => buildUrl('/api/disk/history', { ...rangeParams(hours), mountpoint }),
    mountpoints: ()                                    => buildUrl('/api/disk/mountpoints'),
  },
}
