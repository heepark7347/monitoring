#!/usr/bin/env bash
# setup_k8s_base.sh — kubeadm 기반 Kubernetes 노드 공통 설정
# 용도: 마스터/워커 노드 모두에서 실행 (kubeadm init/join 전 단계)
# 대상 OS: Ubuntu 22.04 / 24.04
# 설치 버전: Kubernetes 1.32.x, containerd 최신 안정본

set -euo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
step()  { echo -e "${BLUE}[STEP]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

if [[ $EUID -ne 0 ]]; then
  error "root 권한으로 실행하세요: sudo $0"
  exit 1
fi

# ── 설정값 (필요 시 수정) ─────────────────────────────────────────────
K8S_VERSION="1.32"                          # 마이너 버전
POD_CIDR="192.168.0.0/16"                   # Calico 기본값 (Flannel은 10.244.0.0/16)

echo ""
echo "================================================================"
echo "  Kubernetes (kubeadm) 노드 기본 설정"
echo "  OS: $(lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY | cut -d= -f2)"
echo "  Hostname: $(hostname)"
echo "  K8s 버전: ${K8S_VERSION}.x"
echo "================================================================"
echo ""

# ── STEP 1: Swap 비활성화 ────────────────────────────────────────────
step "1/7  Swap 비활성화"
swapoff -a
# fstab에서 swap 영구 비활성화 (주석 처리)
sed -i 's|^\([^#].*\sswap\s.*\)$|# \1|' /etc/fstab
info "Swap 비활성화 완료 (현재 및 영구)"

# ── STEP 2: 커널 모듈 로드 ──────────────────────────────────────────
step "2/7  필수 커널 모듈 설정"

cat > /etc/modules-load.d/k8s.conf << 'EOF'
overlay
br_netfilter
EOF

modprobe overlay
modprobe br_netfilter
info "커널 모듈 로드: overlay, br_netfilter"

# ── STEP 3: 커널 파라미터 설정 ──────────────────────────────────────
step "3/7  sysctl 파라미터 설정"

cat > /etc/sysctl.d/99-k8s.conf << 'EOF'
# Kubernetes 필수 커널 파라미터
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF

sysctl --system | grep -E "(bridge-nf|ip_forward)" | head -6 || true
info "sysctl 파라미터 적용 완료"

# ── STEP 4: containerd 설치 ─────────────────────────────────────────
step "4/7  containerd 설치 및 설정"

apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg lsb-release

# Docker 공식 GPG 키 추가 (containerd 패키지 소스)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -qq
apt-get install -y -qq containerd.io
info "containerd 설치 완료"

# containerd 기본 설정 생성 및 SystemdCgroup 활성화
mkdir -p /etc/containerd
containerd config default > /etc/containerd/config.toml

# SystemdCgroup = true 설정 (kubelet과 cgroup driver 일치 필수)
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml

# sandbox_image를 최신 pause 이미지로 설정
sed -i 's|sandbox_image = "registry.k8s.io/pause:.*"|sandbox_image = "registry.k8s.io/pause:3.10"|' \
  /etc/containerd/config.toml

systemctl enable --now containerd
info "containerd 서비스 시작 및 자동 시작 설정 완료"

# ── STEP 5: kubeadm / kubelet / kubectl 설치 ────────────────────────
step "5/7  kubeadm / kubelet / kubectl 설치 (v${K8S_VERSION})"

# Kubernetes 공식 apt 저장소 추가
curl -fsSL "https://pkgs.k8s.io/core:/stable:/v${K8S_VERSION}/deb/Release.key" \
  | gpg --batch --yes --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] \
https://pkgs.k8s.io/core:/stable:/v${K8S_VERSION}/deb/ /" \
  > /etc/apt/sources.list.d/kubernetes.list

apt-get update -qq
apt-get install -y -qq kubelet kubeadm kubectl

# 버전 고정 (자동 업그레이드 방지)
apt-mark hold kubelet kubeadm kubectl
info "kubelet / kubeadm / kubectl 설치 및 버전 고정 완료"

# ── STEP 6: kubelet 서비스 활성화 ───────────────────────────────────
step "6/7  kubelet 서비스 활성화"
systemctl enable kubelet
# kubelet은 kubeadm init/join 전까지 시작 실패 상태가 정상
info "kubelet 서비스 자동 시작 설정 완료 (init/join 전 대기 상태 정상)"

# ── STEP 7: 방화벽 포트 허용 (ufw 사용 시) ──────────────────────────
step "7/7  방화벽 설정"

if systemctl is-active --quiet ufw 2>/dev/null; then
  warn "ufw가 활성화되어 있습니다. 필요한 포트를 엽니다."
  # 마스터 노드 포트
  ufw allow 6443/tcp   comment "Kubernetes API server"   || true
  ufw allow 2379:2380/tcp comment "etcd"                 || true
  ufw allow 10250/tcp  comment "kubelet API"             || true
  ufw allow 10251/tcp  comment "kube-scheduler"          || true
  ufw allow 10252/tcp  comment "kube-controller-manager" || true
  # 워커 노드 포트
  ufw allow 30000:32767/tcp comment "NodePort"           || true
  info "방화벽 포트 허용 완료"
else
  info "ufw 비활성화 상태 — 방화벽 설정 건너뜀"
fi

# ── 완료 출력 ────────────────────────────────────────────────────────
echo ""
echo "================================================================"
echo -e "  ${GREEN}기본 설정 완료${NC}"
echo ""
echo "  설치된 버전:"
echo "    containerd: $(containerd --version | awk '{print $3}')"
echo "    kubeadm:    $(kubeadm version -o short 2>/dev/null)"
echo "    kubelet:    $(kubelet --version 2>/dev/null)"
echo "    kubectl:    $(kubectl version --client --short 2>/dev/null || kubectl version --client | head -1)"
echo ""
echo "  다음 단계:"
echo "    마스터 노드 → kubeadm init (kubeadm_guide.md 참고)"
echo "    워커  노드  → kubeadm join (마스터 초기화 후 출력된 명령어 실행)"
echo "================================================================"
echo ""
