# INFRA LOG

## [2026-03-12] 인프라 구축 시작

### 서버 구성
| Role    | IP           |
|---------|--------------|
| Master  | 172.30.7.245 |
| Worker1 | 172.30.7.246 |
| Worker2 | 172.30.7.247 |

### 작업 내역
- Claude Code 설치 및 인증 완료, 서버 3대 클러스터 구성 준비
- k8s 클러스터링 환경 설정
  - Master 노드: kubeadm init, CNI(Flannel) 설치
  - Worker 노드 2대: kubeadm join (172.30.7.246, 172.30.7.247)
  - 스크립트: `install_master.sh`, `install_worker.sh`
- **K3s 클러스터 구축 완료 (3 노드)** — Master 1대 + Worker 2대 모두 Ready 상태 확인
- **[2026-03-12] K3s → 표준 Kubernetes(kubeadm) 전환** — 클러스터 전체 재구성
  - 전략 변경: K3s 제거 후 kubeadm 기반으로 재설치
  - Master(172.30.7.245): kubeadm init, Calico CNI 설치, v1.32.13
  - Worker(172.30.7.246, 172.30.7.247): setup_worker_node.sh로 동일 버전 설치 및 join
- **클러스터 네트워크 구성 완료 및 전 노드 Ready 상태 확보**
- **[2026-03-12] 원격 모니터링 아키텍처 확정 및 외부 데이터 수집기 설계 시작**
  - 모니터링 전략: 외부 GPU 서버(DCGM Exporter:9400) + 네트워크 장비(SNMP Exporter) 원격 관제
  - ConfigMap(gpu-targets): 외부 GPU 서버 IP 목록 관리
  - Prometheus(monitor-data2): 외부 DCGM Exporter 30초 주기 스크래핑
  - gpu-collector(monitor-data): Prometheus → PostgreSQL 60초 주기 Insert
  - DB 테이블(gpu_metrics): GPU 메트릭 시계열 저장 (인덱스 포함)

---

## [2026-03-12] PostgreSQL 구축 및 Longhorn 스토리지 마이그레이션

### 작업 내역
- PostgreSQL 15-alpine StatefulSet 배포 (namespace: default)
  - 초기 스토리지: local-path → **Longhorn으로 마이그레이션** (HA 확보)
  - PVC: 10Gi, storageClassName: longhorn, replicas: 2 (워커 노드 2대 기준)
  - Secret: postgres-secret (POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB)
  - Service: NodePort 30432로 외부 접근
- Longhorn 기본 replica 수 3 → 2로 패치 (워커 노드 수 맞춤)
- DB 초기화: gpu_metrics, node_metrics, disk_metrics 테이블 자동 생성

### 트러블슈팅
- Longhorn volume degraded: default-replica-count=3이나 워커 2대 → replicas=2로 패치
- hostPort 방식 시도 → Calico portmap 미지원으로 실패 → NodePort 30432로 확정
- StatefulSet serviceName과 Service name 불일치 → postgres-db로 통일

---

## [2026-03-12] 원격 GPU 서버 모니터링 수집 체계 구축

### 수집 대상
- 외부 GPU 서버: 183.111.14.6 (NVIDIA A100-SXM4-40GB, MIG mode)
- DCGM Exporter: 9400 포트 (GPU 메트릭)
- Node Exporter: 9100 포트 (CPU / 메모리 / 디스크 / 네트워크 / 업타임)

### 구성 내역
- Prometheus (prom/prometheus:v2.51.0)
  - scrape_interval: 30s
  - file_sd_configs 방식으로 targets 동적 관리 (targets.json, node-targets.json)
  - relabel: host_ip 레이블 자동 추출
- Python Collector (python:3.11-slim)
  - Prometheus API → PostgreSQL INSERT, 60초 주기
  - 수집 테이블: gpu_metrics / node_metrics / disk_metrics
- ConfigMap gpu-targets: 외부 서버 IP/포트 목록 관리

### 수집 지표
| 테이블 | 주요 지표 |
|---|---|
| gpu_metrics | utilization, memory_used/free, temperature, power, sm/mem clock |
| node_metrics | cpu_pct, memory, load_1/5/15m, net_rx/tx, uptime_seconds |
| disk_metrics | mountpoint별 total/avail/used bytes, usage_percent |

### 트러블슈팅
- Prometheus가 워커 노드에 배치되어 외부 라우팅 불가 → 시간 경과 후 자동 해소
- collector "수집된 데이터 없음": Prometheus targets DOWN 상태였음 → UP 전환 후 정상 수집
- SNMP로 디스크/업타임 수집 시도 → 183.111.14.6 SNMP 타임아웃 → Node Exporter로 대체 수집

---

## [2026-03-13] Git 연동 및 소스코드 관리 체계 수립

### 작업 내역
- GitHub 원격 저장소 연결: https://github.com/heepark7347/monitoring
- .gitignore 설정: secret.yaml, kubeconfig, logs/, *.log 제외
- secret.yaml.example 생성 (실제 값 없는 템플릿으로 커밋)
- 초기 커밋 및 push 완료 (18개 파일)

### 보안 처리
- k8s/database/secret.yaml → .gitignore 제외 (Base64 인코딩된 DB 패스워드 포함)
- k8s/database/secret.yaml.example → 커밋 포함 (빈 템플릿)

---

## [2026-03-13] SNMP 기반 시스템 지표 수집 아키텍처 수립

### 목표
Agentless 모니터링 체계 구축을 위해 외부 서버에 SNMP 설정을 완료하고, 클러스터에 SNMP Exporter 배포 준비

### 구성 내역
- SNMP Exporter (prom/snmp-exporter:v0.26.0) Deployment + ClusterIP Service(9116) 배포
- snmp.yml ConfigMap 작성 (v0.24+ auths/modules 분리 형식)
  - 인증: community `gpu-monitor`, SNMP v2c
  - 모듈 `if_mib`: 네트워크 인터페이스 (ifOperStatus, ifSpeed, ifHCInOctets/OutOctets, 에러/드롭)
  - 모듈 `linux_base`: CPU(User/System/Idle/Wait), 메모리(Total/Avail/Swap), Load Average(1m/5m/15m), 디스크(파티션별 Total/Avail/Used/Percent), sysUpTime
- Prometheus scrape job 2개 추가
  - `snmp-if-mib`: if_mib 모듈, auth=gpu_monitor_auth
  - `snmp-linux-base`: linux_base 모듈, auth=gpu_monitor_auth
- ConfigMap gpu-targets에 snmp-targets.json 추가 (183.111.14.6)

### 전제 조건 (미완료)
- 외부 서버(183.111.14.6)에서 snmpd 실행 및 UDP 161 포트 오픈 필요
- community string `gpu-monitor` snmpd 설정 반영 필요

### 현재 상태
- SNMP Exporter Pod: Running (설정 파싱 정상)
- Prometheus targets: snmpd 활성화 후 UP 전환 예정

---

## [2026-03-13] SNMP Exporter 배포 및 통신 문제 해결

### 목표
Agentless 모니터링 체계 구축 — 외부 서버 SNMP 수집

### 배포 구성
- SNMP Exporter (prom/snmp-exporter:v0.26.0) Deployment + ClusterIP Service (9116)
- snmp.yml ConfigMap (v0.24+ auths/modules 분리 형식)
  - 인증: community `gpu-monitor`, SNMP v2c → auth 이름 `gpu_monitor_auth`
  - 모듈 `if_mib`: 네트워크 인터페이스 (ifHCInOctets/OutOctets, ifOperStatus, ifSpeed, 에러/드롭)
  - 모듈 `linux_base`: CPU(User/System/Idle/Wait), 메모리(Total/Avail/Swap), Load Average(1m/5m/15m), 디스크(파티션별 Total/Avail/Used/Percent), sysUpTime
- Prometheus scrape job 2개: `snmp-if-mib`, `snmp-linux-base`
- gpu-targets ConfigMap에 `snmp-targets.json` 추가 (183.111.14.6)

### 트러블슈팅 과정

#### 1. snmp.yml 설정 형식 오류
- v0.26.0에서 기존 형식(`if_mib: ... auth: community:`) → 신규 형식(`auths: / modules:`) 분리 필요
- 모듈 내부 `auth` 필드 제거, Prometheus scrape params에 `auth: [gpu_monitor_auth]` 추가로 해결

#### 2. SNMP UDP 응답 미수신 (NAT 리턴 패스 문제)
- **증상**: snmpd는 응답 발송(tcpdump Out 확인), SNMP Exporter는 timeout
- **원인 분석**:
  - GPU 서버 공인 IP: 183.111.14.6 (ISP DNAT → 내부 10.10.10.2)
  - snmpd 응답: src=10.10.10.2 → 우리 클러스터 라우터가 인식 불가
  - conntrack 특성상 ESTABLISHED/UNTRACKED 패킷은 nat 테이블 미적용 → iptables SNAT 룰 무효
- **시도한 방법**:
  - GPU 서버 iptables SNAT (to-source 183.111.14.6) → conntrack 0 패킷
  - NOTRACK + SNAT 조합 → UNTRACKED 패킷도 nat 테이블 우회
  - 정책 라우팅(ip rule/route table 200) → 효과 없음
  - WireGuard VPN 시도 → 우리 클러스터 라우터 포트 포워딩 없어 GPU 서버 핸드셰이크 미도달
- **최종 해결**: GPU 서버 snmpd `rocommunity` 허용 대역 수정으로 SNMP Exporter(220.90.209.132) 정상 인증 → 응답 수신 성공

#### 3. snmpd agentAddress 수정
- 기본값 `127.0.0.1:161` → `udp:161` (0.0.0.0 수신)으로 변경

### 최종 수집 확인 (183.111.14.6)
| 모듈 | 주요 지표 |
|---|---|
| linux_base | CPU, 메모리, Load Average, sysUpTime, 디스크 파티션별 사용량 |
| if_mib | 인터페이스별 송수신 바이트, 에러/드롭 카운터, 운영 상태 |

### 모니터링 전략 확정
- **GPU 서버**: DCGM Exporter(GPU) + Node Exporter(시스템) + SNMP(네트워크 인터페이스)
- **일반 서버**: Node Exporter(시스템) + SNMP(네트워크 인터페이스)
- **네트워크 장비**: SNMP Exporter 전용 (snmp-targets.json에 IP 추가만으로 확장)

---

## [2026-03-13] SNMP 메트릭 OID 확장 및 PostgreSQL 저장 체계 구축

### 목표
SNMP로 수집되는 지표를 Prometheus TSDB에만 보관하던 것에서 PostgreSQL 장기 보존 체계로 전환

### OID 확장 (configmap-snmp.yaml)

#### if_mib 모듈 추가 OID
| 메트릭 | OID | 설명 |
|---|---|---|
| ifHighSpeed | 1.3.6.1.2.1.31.1.1.1.15 | 인터페이스 속도 (Mbps, 1G 이상) |
| ifHCInUcastPkts | 1.3.6.1.2.1.31.1.1.1.7 | 수신 유니캐스트 패킷 수 (64-bit) |
| ifHCOutUcastPkts | 1.3.6.1.2.1.31.1.1.1.11 | 송신 유니캐스트 패킷 수 (64-bit) |

#### linux_base 모듈 추가 OID
| 메트릭 | OID | 설명 |
|---|---|---|
| ssCpuRawUser | 1.3.6.1.4.1.2021.11.50.0 | CPU 사용자 누적 틱 (counter, rate() 계산용) |
| ssCpuRawSystem | 1.3.6.1.4.1.2021.11.52.0 | CPU 커널 누적 틱 |
| ssCpuRawIdle | 1.3.6.1.4.1.2021.11.53.0 | CPU 유휴 누적 틱 |
| ssCpuRawWait | 1.3.6.1.4.1.2021.11.54.0 | I/O 대기 누적 틱 (기존 gauge 오류 수정 → counter) |
| memBuffer | 1.3.6.1.4.1.2021.4.14.0 | 버퍼 메모리 (KB) |
| memCached | 1.3.6.1.4.1.2021.4.15.0 | 캐시 메모리 (KB) |
| memShared | 1.3.6.1.4.1.2021.4.13.0 | 공유 메모리 (KB) |

### 신규 DB 테이블 (configmap-collector.yaml)

#### snmp_interface_metrics
인터페이스별 트래픽/에러/드롭 수집 (60초 주기)
- 주요 컬럼: if_descr, if_oper_status, if_speed_mbps, in/out_octets_rate(B/s), in/out_ucast_pkts_rate(pps), in/out_errors_rate, in/out_discards_rate

#### snmp_system_metrics
호스트별 CPU/메모리/부하/업타임 수집 (60초 주기)
- 주요 컬럼: uptime_seconds, cpu_user/system/idle_pct, mem_total/avail/buffer/cached_kb, swap_total/avail_kb, load_1m/5m/15m

### Python Collector 확장
- `collect_snmp_iface()`: Prometheus에서 ifHCInOctets rate, ifHCOutOctets rate 등 10개 쿼리 → snmp_interface_metrics INSERT
- `collect_snmp_system()`: ssCpuUser, memTotalReal, laLoad 등 13개 쿼리 → snmp_system_metrics INSERT
- `prom_query_iface()`: (host_ip, ifDescr) 키 기반 인터페이스 단위 쿼리 헬퍼 추가

### 수집 확인 (183.111.14.6)
- snmp_interface_metrics: 14개 인터페이스 (up 상태) 정상 수집
  - ens10f0(물리 NIC): 수신 0.22 kB/s, 송신 1.65 kB/s
  - cni0(K8s CNI bridge): 수신 3.11 kB/s, 송신 2.44 kB/s
  - 에러/드롭 모두 0
- snmp_system_metrics: CPU idle 98%, 메모리 가용 113.7GB/125.5GB, Load 0

---

## [2026-03-13] 커스텀 모니터링 웹 대시보드 구축 (Next.js + D3.js)

### 목표
Grafana 외 운영자 편의성 향상을 위한 커스텀 대시보드 구축 — PostgreSQL 수집 데이터 직접 시각화

### 아키텍처
```
브라우저 → Next.js (3000) → rewrite 프록시 → FastAPI (8000) → PostgreSQL (30432)
```
- 백엔드(FastAPI)와 프론트엔드(Next.js) 분리 구조
- 외부에서 3000 포트 단일 접점 (8000 포트 미노출)
- Next.js `rewrites`로 `/api/*` → `localhost:8000/api/*` 내부 프록시

### 백엔드 구성 (web/backend/ — FastAPI)

| 파일 | 역할 |
|---|---|
| app/main.py | FastAPI 앱, CORS 설정, 라우터 등록 |
| app/database.py | psycopg2 ConnectionPool, fetchall_as_dict 헬퍼 |
| routers/gpu.py | /api/gpu/latest, /history?hours=N&gpu_index=N |
| routers/node.py | /api/node/latest, /history, /snmp/latest, /snmp/history |
| routers/network.py | /api/network/interfaces, /latest, /history?hours=N&interface=X |
| routers/disk.py | /api/disk/latest, /history?hours=N&mountpoint=X, /mountpoints |

- DB 연결: NodePort 30432 (PostgreSQL)
- history 엔드포인트: `hours` 파라미터로 시간 범위 지정 (서버에서 start/end 계산)
- 실행: `uvicorn app.main:app --host 0.0.0.0 --port 8000`

### 프론트엔드 구성 (web/frontend/ — Next.js 14 + D3.js + Tailwind)

#### 페이지 구성
| 경로 | 내용 |
|---|---|
| / | GPU Health & Utilization (게이지, 시계열 4개) |
| /system | 시스템 현황 (CPU/메모리 게이지, Load Average, 네트워크) |
| /network | 인터페이스별 트래픽 In/Out/pps/에러, 전체 인터페이스 테이블 |
| /disk | 파티션별 도넛 차트, 사용률 히스토리 |

#### D3 차트 컴포넌트
- `GaugeChart`: 반원 게이지 (0-100%, 임계값별 색상 green/amber/red), viewBox 기반 렌더링
- `LineChart`: 다중 시계열 라인+영역 차트, viewBox 기반 렌더링 (560×height 가상 좌표)
- `DonutChart`: 원형 도넛 사용률 차트

#### 공통 UI
- `TimeRangePicker`: 1H / 6H / 24H / 7D 선택 버튼
- `MetricCard`: 수치 카드 (임계값 색상 표시)
- `Sidebar`: 4개 페이지 네비게이션
- SWR 60초 polling 자동 갱신

### 트러블슈팅

#### 1. 차트 렌더링 안 됨 (빈 박스)
- **원인**: D3가 SVG의 `clientWidth`를 0으로 읽음 (DOM 레이아웃 전에 useEffect 실행)
- **해결**: SVG에 `viewBox="0 0 560 180"` 설정, 컨테이너 크기 측정 불필요

#### 2. 차트 "데이터 로딩 중..." 고착
- **원인**: `rangeParams()`가 `new Date()`를 매 렌더마다 호출 → SWR 키가 렌더링마다 변경 → 항상 새 요청으로 인식해 이전 요청 폐기 반복
- **해결**: 시간 범위를 `start/end` ISO 문자열 대신 `hours` 파라미터로 단순화 → SWR 키 안정화

#### 3. 외부 접속 시 API connection refused
- **원인**: `NEXT_PUBLIC_API_URL=http://220.90.209.134:8000`으로 설정 시 브라우저가 8000 포트 직접 접근 시도 → 방화벽 차단
- **해결**: Next.js `rewrites`로 내부 프록시, `NEXT_PUBLIC_API_URL` 제거 (상대경로 `/api/*` 사용)

#### 4. 메모리 단위 오류
- **원인**: DCGM_FI_DEV_FB_USED/FREE는 bytes 단위 반환, DB 컬럼명이 `memory_used_mb`로 오해 유발
- **해결**: 프론트엔드에서 `÷ (1024³)` 변환하여 GB 표시

### 실행 방법
```bash
# 백엔드
cd web/backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000

# 프론트엔드
cd web/frontend && npm run dev -- --hostname 0.0.0.0 --port 3000
```

### 접속 주소
- 대시보드: http://220.90.209.134:3000
- API (내부): http://localhost:8000/docs

---

## [2026-03-12] 트러블슈팅: K3s 설치 시 CRI v1 runtime API 에러

### 증상
K3s 설치 중 아래와 같은 에러 발생:
```
level=fatal msg="starting kubernetes: preparing server: failed to initialize datastore: \
  context deadline exceeded" ...
FATA[...] Failed to find working CRI: failed to connect to any CRI endpoint
```
또는:
```
CRI v1 runtime API is not implemented for endpoint
```

### 원인
containerd 기존 설정이 잘못되어 있거나 SystemdCgroup이 비활성화된 상태로 K3s와 충돌 발생.

### 해결 방법

1. containerd 서비스 중지 및 기존 설정 초기화
```bash
sudo systemctl stop containerd
sudo rm -f /etc/containerd/config.toml
```

2. 기본 설정 파일 재생성 후 SystemdCgroup 활성화
```bash
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
```

3. containerd 재시작 및 K3s 재설치
```bash
sudo systemctl restart containerd
# K3s 재설치
curl -sfL https://get.k3s.io | sh -
```

### 결과
containerd 설정 초기화 및 SystemdCgroup 활성화 후 K3s 정상 설치 완료.
