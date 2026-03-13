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
