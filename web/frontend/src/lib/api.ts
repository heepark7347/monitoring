const BASE = ''  // Next.js rewrite 프록시 사용 (/api/* → localhost:8000/api/*)

export function buildUrl(path: string, params: Record<string, string | number | undefined> = {}) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return `${BASE}${path}${qs ? '?' + qs : ''}`
}

export const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    return r.json()
  })

export const api = {
  gpu: {
    latest:  ()                              => buildUrl('/api/gpu/latest'),
    history: (hours: number, gpuIndex = 0)  => buildUrl('/api/gpu/history', { hours, gpu_index: gpuIndex }),
    indexes: ()                              => buildUrl('/api/gpu/indexes'),
  },
  node: {
    latest:      ()               => buildUrl('/api/node/latest'),
    history:     (hours: number)  => buildUrl('/api/node/history',      { hours }),
    snmpLatest:  ()               => buildUrl('/api/node/snmp/latest'),
    snmpHistory: (hours: number)  => buildUrl('/api/node/snmp/history', { hours }),
  },
  network: {
    interfaces: ()                              => buildUrl('/api/network/interfaces'),
    latest:     ()                              => buildUrl('/api/network/latest'),
    history:    (hours: number, iface: string)  => buildUrl('/api/network/history', { hours, interface: iface }),
  },
  disk: {
    latest:      ()                                  => buildUrl('/api/disk/latest'),
    history:     (hours: number, mountpoint: string) => buildUrl('/api/disk/history', { hours, mountpoint }),
    mountpoints: ()                                  => buildUrl('/api/disk/mountpoints'),
  },
}
