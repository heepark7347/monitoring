#!/usr/bin/env bash
# setup_worker_node.sh — Kubernetes 워커 노드 완전 재설치 스크립트
# 용도: 기존 설치 완전 제거 후 마스터와 동일 버전으로 재설치 + 클러스터 조인
# 대상 OS: Ubuntu 22.04 / 24.04
# K8s 버전: 1.32.x (마스터와 동일)
#
# 사용법:
#   sudo bash setup_worker_node.sh \
#     --master-ip 172.30.7.245 \
#     --token 15jnnz.snslbnm4qri8ibot \
#     --hash sha256:4cafe3e8b831e34bb180ba129ffa71f64614b3000c7b03345e0c3939d61a12f8

set -euo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
step()  { echo -e "${BLUE}[STEP]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ── 인자 파싱 ────────────────────────────────────────────────────────
MASTER_IP=""
JOIN_TOKEN=""
JOIN_HASH=""
K8S_VERSION="1.32"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --master-ip) MASTER_IP="$2"; shift 2 ;;
    --token)     JOIN_TOKEN="$2"; shift 2 ;;
    --hash)      JOIN_HASH="$2"; shift 2 ;;
    *) error "알 수 없는 옵션: $1"; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  error "root 권한으로 실행하세요: sudo $0 [옵션]"
  exit 1
fi

echo ""
echo "================================================================"
echo "  Kubernetes 워커 노드 재설치 스크립트"
echo "  OS      : $(lsb_release -ds 2>/dev/null)"
echo "  Hostname: $(hostname)"
echo "  K8s     : v${K8S_VERSION}.x"
echo "  Master  : ${MASTER_IP:-'(join 단계에서 입력)'}"
echo "================================================================"
echo ""

# ══════════════════════════════════════════════════════════════════════
# PHASE 1: 완전 초기화
# ══════════════════════════════════════════════════════════════════════
step "PHASE 1/3  기존 설치 완전 제거"

# K3s 제거 (있을 경우)
if [[ -f /usr/local/bin/k3s-uninstall.sh ]]; then
  info "K3s 제거 중..."
  /usr/local/bin/k3s-uninstall.sh 2>/dev/null || true
elif [[ -f /usr/local/bin/k3s-agent-uninstall.sh ]]; then
  /usr/local/bin/k3s-agent-uninstall.sh 2>/dev/null || true
fi

# kubeadm reset
if command -v kubeadm &>/dev/null; then
  info "kubeadm reset 실행 중..."
  kubeadm reset -f 2>/dev/null || true
fi

# 서비스 중지
systemctl stop kubelet containerd 2>/dev/null || true

# 마운트 해제
umount $(mount | grep '/var/lib/kubelet' | awk '{print $3}') 2>/dev/null || true

# 패키지 제거
apt-mark unhold kubelet kubeadm kubectl 2>/dev/null || true
apt-get purge -y kubelet kubeadm kubectl containerd.io kubernetes-cni cri-tools 2>/dev/null || true
apt-get autoremove -y 2>/dev/null || true

# 디렉토리 및 설정 파일 완전 삭제
rm -rf \
  /etc/kubernetes \
  /var/lib/kubelet \
  /var/lib/etcd \
  /var/lib/containerd \
  /etc/containerd \
  /run/containerd \
  /opt/cni \
  /etc/cni \
  /var/log/pods \
  /var/log/containers \
  /run/flannel \
  /run/k3s \
  /var/lib/rancher \
  /etc/rancher \
  $HOME/.kube \
  /usr/local/bin/k3s \
  /usr/local/bin/kubectl \
  /etc/apt/sources.list.d/docker.list \
  /etc/apt/sources.list.d/kubernetes.list \
  /etc/apt/keyrings/docker.gpg \
  /etc/apt/keyrings/kubernetes-apt-keyring.gpg \
  /etc/modules-load.d/k8s.conf \
  /etc/sysctl.d/99-k8s.conf 2>/dev/null || true

# 가상 네트워크 인터페이스 제거
for iface in flannel.1 cni0 tunl0 vxlan.calico kube-ipvs0 calico0; do
  ip link delete "$iface" 2>/dev/null || true
done

# iptables 초기화
iptables -F && iptables -X
iptables -t nat -F && iptables -t nat -X
iptables -t mangle -F && iptables -t mangle -X

systemctl daemon-reload
info "기존 설치 완전 제거 완료"

# ══════════════════════════════════════════════════════════════════════
# PHASE 2: 기본 환경 설치
# ══════════════════════════════════════════════════════════════════════
step "PHASE 2/3  Kubernetes 기본 환경 설치"

# 2-1. Swap 비활성화
swapoff -a
sed -i 's|^\([^#].*\sswap\s.*\)$|# \1|' /etc/fstab
info "Swap 비활성화 완료"

# 2-2. 커널 모듈
cat > /etc/modules-load.d/k8s.conf << 'EOF'
overlay
br_netfilter
EOF
modprobe overlay
modprobe br_netfilter
info "커널 모듈 로드 완료"

# 2-3. sysctl
cat > /etc/sysctl.d/99-k8s.conf << 'EOF'
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sysctl --system | grep -E "(bridge-nf|ip_forward)" | head -6 || true
info "sysctl 파라미터 적용 완료"

# 2-4. containerd 설치
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg lsb-release

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -qq
apt-get install -y -qq containerd.io
info "containerd 설치 완료: $(containerd --version)"

# 2-5. containerd 설정 (SystemdCgroup)
mkdir -p /etc/containerd
containerd config default > /etc/containerd/config.toml
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
sed -i 's|sandbox_image = "registry.k8s.io/pause:.*"|sandbox_image = "registry.k8s.io/pause:3.10"|' \
  /etc/containerd/config.toml 2>/dev/null || true

systemctl enable --now containerd
info "containerd 설정 및 시작 완료 (SystemdCgroup=true)"

# 2-6. kubeadm / kubelet / kubectl 설치 (마스터와 동일 버전 저장소)
curl -fsSL "https://pkgs.k8s.io/core:/stable:/v${K8S_VERSION}/deb/Release.key" \
  | gpg --batch --yes --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] \
https://pkgs.k8s.io/core:/stable:/v${K8S_VERSION}/deb/ /" \
  > /etc/apt/sources.list.d/kubernetes.list

apt-get update -qq
apt-get install -y -qq kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl

systemctl enable kubelet
info "kubelet / kubeadm / kubectl 설치 완료"

# 2-7. kubelet cgroupDriver 강제 고정 (join 전 불일치 방지)
mkdir -p /var/lib/kubelet
cat > /var/lib/kubelet/config.yaml << 'EOF'
kind: KubeletConfiguration
apiVersion: kubelet.config.k8s.io/v1beta1
cgroupDriver: systemd
EOF
info "kubelet cgroupDriver=systemd 고정 완료"

echo ""
echo "  설치된 버전:"
echo "    containerd : $(containerd --version | awk '{print $3}')"
echo "    kubeadm    : $(kubeadm version -o short 2>/dev/null)"
echo "    kubelet    : $(kubelet --version 2>/dev/null)"
echo "    kubectl    : $(kubectl version --client 2>/dev/null | head -1)"

# ══════════════════════════════════════════════════════════════════════
# PHASE 3: 클러스터 조인
# ══════════════════════════════════════════════════════════════════════
step "PHASE 3/3  클러스터 조인"

if [[ -z "$MASTER_IP" || -z "$JOIN_TOKEN" || -z "$JOIN_HASH" ]]; then
  warn "--master-ip / --token / --hash 가 지정되지 않았습니다."
  warn "설치만 완료했습니다. 아래 명령어로 직접 조인하세요:"
  echo ""
  echo "  # 마스터 노드에서 토큰 재발급 (필요 시):"
  echo "  kubeadm token create --print-join-command"
  echo ""
  echo "  # 워커 노드에서 조인:"
  echo "  sudo kubeadm join <MASTER_IP>:6443 --token <TOKEN> --discovery-token-ca-cert-hash sha256:<HASH>"
else
  info "마스터 노드(${MASTER_IP})에 조인 중..."
  kubeadm join "${MASTER_IP}:6443" \
    --token "${JOIN_TOKEN}" \
    --discovery-token-ca-cert-hash "${JOIN_HASH}" 2>&1

  echo ""
  echo "================================================================"
  echo -e "  ${GREEN}워커 노드 조인 완료${NC}"
  echo "  마스터 노드에서 확인: kubectl get nodes"
  echo "================================================================"
fi

echo ""
echo "================================================================"
echo -e "  ${GREEN}설치 완료${NC}  |  hostname: $(hostname)"
echo "================================================================"
echo ""
