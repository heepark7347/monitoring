#!/bin/bash
# install_master.sh — Kubernetes Master Node 설치 스크립트
# 대상: 172.30.7.245
# OS: Ubuntu 22.04 LTS 기준

set -euo pipefail

MASTER_IP="172.30.7.245"
POD_CIDR="10.244.0.0/16"       # Flannel 기본값
K8S_VERSION="1.29"

echo "========================================"
echo " [1/7] 시스템 기본 설정"
echo "========================================"

# swap 비활성화 (k8s 요구사항)
swapoff -a
sed -i '/ swap / s/^\(.*\)$/#\1/' /etc/fstab

# 커널 모듈 로드
cat <<EOF | tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF
modprobe overlay
modprobe br_netfilter

# sysctl 설정
cat <<EOF | tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sysctl --system

echo "========================================"
echo " [2/7] containerd 설치"
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

# containerd 기본 설정 (SystemdCgroup 활성화)
mkdir -p /etc/containerd
containerd config default | tee /etc/containerd/config.toml
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml

systemctl daemon-reload
systemctl enable --now containerd

echo "========================================"
echo " [3/7] kubeadm / kubelet / kubectl 설치"
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
echo " [4/7] kubeadm init (Master 초기화)"
echo "========================================"

kubeadm init \
  --apiserver-advertise-address="${MASTER_IP}" \
  --pod-network-cidr="${POD_CIDR}" \
  --upload-certs \
  | tee /root/kubeadm_init.log

echo "========================================"
echo " [5/7] kubectl 설정 (root)"
echo "========================================"

mkdir -p "$HOME/.kube"
cp /etc/kubernetes/admin.conf "$HOME/.kube/config"
chown "$(id -u):$(id -g)" "$HOME/.kube/config"

echo "========================================"
echo " [6/7] CNI — Flannel 설치"
echo "========================================"

kubectl apply -f \
  https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml

echo "========================================"
echo " [7/7] Worker 조인 토큰 추출"
echo "========================================"

JOIN_CMD=$(kubeadm token create --print-join-command 2>/dev/null)

echo ""
echo "------------------------------------------------------------"
echo "  Worker 노드에서 아래 명령을 root 권한으로 실행하세요."
echo "------------------------------------------------------------"
echo "  ${JOIN_CMD}"
echo "------------------------------------------------------------"
echo ""

# 파일로도 저장
echo "${JOIN_CMD}" > /root/worker_join_command.sh
chmod 600 /root/worker_join_command.sh
echo "  [저장 위치] /root/worker_join_command.sh"
echo ""
echo "Master 설치 완료."
