#!/bin/bash
# install_worker.sh — Kubernetes Worker Node 설치 스크립트
# 대상: 172.30.7.246, 172.30.7.247
# 사용법: sudo bash install_worker.sh <JOIN_TOKEN> <CA_CERT_HASH>
#
#   예) sudo bash install_worker.sh \
#         abcdef.0123456789abcdef \
#         sha256:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
#
# JOIN_TOKEN, CA_CERT_HASH 는 Master에서 생성된
# /root/worker_join_command.sh 또는 kubeadm init 출력에서 확인하세요.

set -euo pipefail

MASTER_IP="172.30.7.245"
MASTER_PORT="6443"
K8S_VERSION="1.29"

# 인자 확인
if [[ $# -lt 2 ]]; then
  echo "사용법: sudo bash $0 <JOIN_TOKEN> <CA_CERT_HASH>"
  echo ""
  echo "  Master(/root/worker_join_command.sh)에서 토큰과 해시를 확인하세요."
  exit 1
fi

JOIN_TOKEN="$1"
CA_CERT_HASH="$2"

echo "========================================"
echo " [1/6] 시스템 기본 설정"
echo "========================================"

swapoff -a
sed -i '/ swap / s/^\(.*\)$/#\1/' /etc/fstab

cat <<EOF | tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF
modprobe overlay
modprobe br_netfilter

cat <<EOF | tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sysctl --system

echo "========================================"
echo " [2/6] containerd 설치"
echo "========================================"

apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y containerd.io

mkdir -p /etc/containerd
containerd config default | tee /etc/containerd/config.toml
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml

systemctl daemon-reload
systemctl enable --now containerd

echo "========================================"
echo " [3/6] kubeadm / kubelet / kubectl 설치"
echo "========================================"

apt-get install -y apt-transport-https gpg

curl -fsSL "https://pkgs.k8s.io/core:/stable:/v${K8S_VERSION}/deb/Release.key" \
  | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] \
  https://pkgs.k8s.io/core:/stable:/v${K8S_VERSION}/deb/ /" \
  | tee /etc/apt/sources.list.d/kubernetes.list

apt-get update -y
apt-get install -y kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl

systemctl enable --now kubelet

echo "========================================"
echo " [4/6] Master 노드 연결 확인"
echo "========================================"

if ! nc -z -w5 "${MASTER_IP}" "${MASTER_PORT}" 2>/dev/null; then
  echo "[ERROR] Master(${MASTER_IP}:${MASTER_PORT})에 연결할 수 없습니다."
  echo "  - 방화벽/보안그룹에서 6443 포트를 허용했는지 확인하세요."
  exit 1
fi
echo "Master(${MASTER_IP}:${MASTER_PORT}) 연결 확인 완료."

echo "========================================"
echo " [5/6] kubeadm join — 클러스터 합류"
echo "========================================"

kubeadm join "${MASTER_IP}:${MASTER_PORT}" \
  --token "${JOIN_TOKEN}" \
  --discovery-token-ca-cert-hash "${CA_CERT_HASH}"

echo "========================================"
echo " [6/6] 완료"
echo "========================================"
echo ""
echo "Worker 노드가 클러스터에 합류했습니다."
echo "Master에서 아래 명령으로 노드 상태를 확인하세요:"
echo ""
echo "  kubectl get nodes"
echo ""
