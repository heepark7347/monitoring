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

export const poster = (url: string, method: 'POST' | 'DELETE' = 'POST') =>
  fetch(url, { method }).then(r => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    return r.json()
  })

export const jsonFetch = (url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: object) =>
  fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => {
    if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.detail ?? `${r.status}`)))
    return r.json()
  })

export const api = {
  dashboard: {
    summary: () => buildUrl('/api/dashboard/summary'),
    pause:   (key: string) => buildUrl(`/api/dashboard/sensors/${encodeURIComponent(key)}/pause`),
    resume:  (key: string) => buildUrl(`/api/dashboard/sensors/${encodeURIComponent(key)}/pause`),
    connectivityHistory: (hostIp: string, sensorType: string, sensorName: string, hours: number) =>
      buildUrl(`/api/dashboard/connectivity/${encodeURIComponent(hostIp)}/history`, { sensor_type: sensorType, sensor_name: sensorName, hours }),
  },
  devices: {
    list:  ()                => buildUrl('/api/devices'),
    byId:  (id: number)      => buildUrl(`/api/devices/${id}`),
  },
  settings: {
    devices: {
      list:     ()                    => buildUrl('/api/settings/devices'),
      add:      ()                    => buildUrl('/api/settings/devices'),
      update:   (hostIp: string)      => buildUrl(`/api/settings/devices/${encodeURIComponent(hostIp)}`),
      remove:   (hostIp: string)      => buildUrl(`/api/settings/devices/${encodeURIComponent(hostIp)}`),
      discover: (hostIp: string)      => buildUrl(`/api/settings/sensors/discover/${encodeURIComponent(hostIp)}`),
    },
    sensors: {
      list:      (hostIp: string) => buildUrl('/api/settings/sensors', { host_ip: hostIp }),
      available: (hostIp: string) => buildUrl(`/api/settings/sensors/available/${encodeURIComponent(hostIp)}`),
      register:  ()               => buildUrl('/api/settings/sensors'),
      update:    (id: number)     => buildUrl(`/api/settings/sensors/${id}`),
      remove:    (id: number)     => buildUrl(`/api/settings/sensors/${id}`),
    },
    probe: () => buildUrl('/api/settings/probe'),
  },
  gpu: {
    latest:       ()                                              => buildUrl('/api/gpu/latest'),
    history:      (hours: number, gpuIndex = 0, hostIp?: string) => buildUrl('/api/gpu/history', { hours, gpu_index: gpuIndex, host_ip: hostIp }),
    indexes:      ()                                             => buildUrl('/api/gpu/indexes'),
    sensorDetail: (hostIp: string, sensorName: string, hours: number) =>
      buildUrl(`/api/gpu/sensor/${encodeURIComponent(hostIp)}`, { sensor_name: sensorName, hours }),
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
