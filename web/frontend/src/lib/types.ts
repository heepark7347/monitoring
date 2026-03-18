export interface GpuLatest {
  collected_at: string
  host_ip: string
  gpu_index: number
  gpu_uuid: string
  model_name: string
  gpu_utilization: number | null
  memory_used_mb: number | null
  memory_free_mb: number | null
  temperature_celsius: number | null
  power_usage_watts: number | null
  sm_clock_mhz: number | null
  mem_clock_mhz: number | null
  xid_errors: number | null
  ecc_sbe: number | null
  ecc_dbe: number | null
  pcie_replay: number | null
  power_violation: number | null
  thermal_violation: number | null
}

export interface GpuHistory {
  collected_at: string
  gpu_index: number
  gpu_utilization: number | null
  memory_used_mb: number | null
  memory_free_mb: number | null
  temperature_celsius: number | null
  power_usage_watts: number | null
  sm_clock_mhz: number | null
  mem_clock_mhz: number | null
  xid_errors: number | null
  ecc_sbe: number | null
  ecc_dbe: number | null
  pcie_replay: number | null
  power_violation: number | null
  thermal_violation: number | null
}

export interface NodeLatest {
  collected_at: string
  host_ip: string
  cpu_usage_percent: number | null
  memory_total_bytes: number | null
  memory_available_bytes: number | null
  memory_usage_percent: number | null
  load_1m: number | null
  load_5m: number | null
  load_15m: number | null
  net_receive_bytes: number | null
  net_transmit_bytes: number | null
  uptime_seconds: number | null
}

export interface SnmpSystemLatest {
  collected_at: string
  host_ip: string
  uptime_seconds: number | null
  cpu_user_pct: number | null
  cpu_system_pct: number | null
  cpu_idle_pct: number | null
  mem_total_kb: number | null
  mem_avail_kb: number | null
  mem_buffer_kb: number | null
  mem_cached_kb: number | null
  mem_swap_total_kb: number | null
  mem_swap_avail_kb: number | null
  load_1m: number | null
  load_5m: number | null
  load_15m: number | null
}

export interface NetworkLatest {
  collected_at: string
  host_ip: string
  if_descr: string
  if_oper_status: number | null
  if_speed_mbps: number | null
  if_in_octets_rate: number | null
  if_out_octets_rate: number | null
  if_in_ucast_pkts_rate: number | null
  if_out_ucast_pkts_rate: number | null
  if_in_errors_rate: number | null
  if_out_errors_rate: number | null
  if_in_discards_rate: number | null
  if_out_discards_rate: number | null
}

export interface NetworkHistory {
  collected_at: string
  if_descr: string
  if_in_octets_rate: number | null
  if_out_octets_rate: number | null
  if_in_ucast_pkts_rate: number | null
  if_out_ucast_pkts_rate: number | null
  if_in_errors_rate: number | null
  if_out_errors_rate: number | null
}

export interface DiskLatest {
  collected_at: string
  host_ip: string
  mountpoint: string
  device: string
  fstype: string
  total_bytes: number | null
  avail_bytes: number | null
  usage_percent: number | null
}

// ── Dashboard / Device 타입 ──────────────────────────────────
export type SensorStatus = 'up' | 'down' | 'warning' | 'pause'

export interface Sensor {
  key:              string
  host_ip:          string
  type:             'GPU' | 'Disk' | 'Network' | 'Node' | 'ICMP' | 'Port'
  sensor_name:      string
  name:             string
  status:           SensorStatus
  detail?:          string
  latency_ms?:      number | null
  packet_loss_pct?: number | null
}

export interface DashboardSummary {
  counts: { up: number; down: number; warning: number; pause: number; total: number }
  alerts: Sensor[]
  sensors: Sensor[]
}

export interface Device {
  id:           number
  host_ip:      string
  display_name: string
  sensor_types: ('gpu' | 'node' | 'disk' | 'network' | 'icmp' | 'port')[]
}

export interface DeviceDetail {
  id:           number
  host_ip:      string
  display_name: string
  created_at:   string
}

// ── Settings 타입 ─────────────────────────────────────────────
export interface RegisteredDevice {
  id: number
  host_ip: string
  display_name: string
  created_at: string
}

export interface SensorConfig {
  id:          number
  host_ip:     string
  sensor_type: 'gpu' | 'node' | 'disk' | 'network' | 'icmp' | 'port'
  sensor_name: string
  enabled:     boolean
  display_name: string | null
}

export interface AvailableSensor {
  sensor_type: 'gpu' | 'node' | 'disk' | 'network' | 'icmp' | 'port'
  sensor_name: string
  registered:  boolean
  config_id:   number | null
}

export interface K8sNode {
  name:                string
  roles:               string[]
  ready:               boolean
  internal_ip:         string | null
  k8s_version:         string
  os_image:            string
  container_runtime:   string
  cpu_capacity:        number
  mem_capacity_gb:     number
  cpu_allocatable:     number
  mem_allocatable_gb:  number
  pods_running:        number
  pods_total:          number
  pod_capacity:        number
  mem_pressure:        boolean
  disk_pressure:       boolean
  pid_pressure:        boolean
  unschedulable:       boolean
}

export interface K8sNodesResponse {
  nodes: K8sNode[]
  error?: string
}

export type TimeRange = '1H' | '6H' | '24H' | '7D'

export interface TimeRangeOption {
  label: TimeRange
  hours: number
}
