#!/usr/bin/env bash
# cleanup_k3s.sh — K3s 및 관련 리소스 완전 제거
# 용도: kubeadm 기반 클러스터로 전환 전 실행
# 대상: 모든 노드 (마스터/워커)

set -euo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

if [[ $EUID -ne 0 ]]; then
  error "root 권한으로 실행하세요: sudo $0"
  exit 1
fi

confirm() {
  read -r -p "$(echo -e "${YELLOW}$1 [y/N]: ${NC}")" ans
  [[ "${ans,,}" == "y" ]]
}

echo ""
echo "================================================================"
echo "  K3s 완전 제거 스크립트"
echo "  실행 후 K3s, 컨테이너, 네트워크 인터페이스가 모두 삭제됩니다."
echo "================================================================"
echo ""

if ! confirm "계속 진행하시겠습니까?"; then
  info "취소되었습니다."
  exit 0
fi

# ── 1. K3s 서비스 중지 ─────────────────────────────────────────────
info "K3s 서비스 중지 중..."

if systemctl is-active --quiet k3s 2>/dev/null; then
  systemctl stop k3s
  systemctl disable k3s
  info "k3s 서비스 중지 완료"
else
  warn "k3s 서비스가 실행 중이 아닙니다"
fi

if systemctl is-active --quiet k3s-agent 2>/dev/null; then
  systemctl stop k3s-agent
  systemctl disable k3s-agent
  info "k3s-agent 서비스 중지 완료"
fi

# ── 2. K3s 공식 언인스톨 스크립트 실행 ──────────────────────────────
info "K3s 언인스톨 스크립트 실행 중..."

if [[ -f /usr/local/bin/k3s-uninstall.sh ]]; then
  /usr/local/bin/k3s-uninstall.sh || warn "k3s-uninstall.sh 실행 중 일부 오류 발생 (무시하고 계속)"
  info "마스터 노드 K3s 제거 완료"
elif [[ -f /usr/local/bin/k3s-agent-uninstall.sh ]]; then
  /usr/local/bin/k3s-agent-uninstall.sh || warn "k3s-agent-uninstall.sh 실행 중 일부 오류 발생 (무시하고 계속)"
  info "워커 노드 K3s agent 제거 완료"
else
  warn "K3s 언인스톨 스크립트를 찾을 수 없습니다. 수동으로 제거합니다."
fi

# ── 3. 남은 K3s 바이너리 및 설정 파일 제거 ──────────────────────────
info "K3s 바이너리 및 설정 파일 제거 중..."

K3S_FILES=(
  /usr/local/bin/k3s
  /usr/local/bin/k3s-uninstall.sh
  /usr/local/bin/k3s-agent-uninstall.sh
  /usr/local/bin/kubectl
  /usr/local/bin/crictl
  /usr/local/bin/ctr
  /etc/systemd/system/k3s.service
  /etc/systemd/system/k3s-agent.service
  /etc/systemd/system/k3s.service.env
)

for f in "${K3S_FILES[@]}"; do
  if [[ -e "$f" ]]; then
    rm -f "$f" && info "삭제: $f"
  fi
done

K3S_DIRS=(
  /var/lib/rancher
  /etc/rancher
  /var/lib/kubelet
  /run/k3s
  /run/flannel
  /var/log/pods
)

for d in "${K3S_DIRS[@]}"; do
  if [[ -d "$d" ]]; then
    rm -rf "$d" && info "디렉토리 삭제: $d"
  fi
done

# ── 4. CNI 설정 제거 ────────────────────────────────────────────────
info "CNI 설정 제거 중..."
rm -rf /etc/cni /opt/cni/bin /var/lib/cni || true

# ── 5. 가상 네트워크 인터페이스 제거 ────────────────────────────────
info "가상 네트워크 인터페이스 정리 중..."

for iface in flannel.1 cni0 tunl0 vxlan.calico kube-ipvs0; do
  if ip link show "$iface" &>/dev/null; then
    ip link delete "$iface" && info "인터페이스 삭제: $iface"
  fi
done

# iptables 규칙 정리
if command -v iptables &>/dev/null; then
  iptables -F && iptables -X && iptables -t nat -F && iptables -t nat -X || warn "iptables 초기화 중 일부 오류"
  info "iptables 규칙 초기화 완료"
fi

# ── 6. systemd 데몬 리로드 ───────────────────────────────────────────
systemctl daemon-reload
info "systemd daemon-reload 완료"

echo ""
echo "================================================================"
echo -e "  ${GREEN}K3s 제거 완료${NC}"
echo "  다음 단계: setup_k8s_base.sh 실행"
echo "================================================================"
echo ""
