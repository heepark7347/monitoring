# kubeadm 클러스터 구성 가이드

## 전제 조건
- 모든 노드에서 `setup_k8s_base.sh` 실행 완료
- 마스터 노드: 최소 2 CPU, 2GB RAM
- 노드 간 네트워크 통신 가능 (방화벽 포트 확인)

---

## 1. 마스터 노드 초기화

### 1-1. kubeadm init 실행

```bash
# Calico CNI 사용 시 (권장 — GPU 워크로드 환경)
sudo kubeadm init \
  --pod-network-cidr=192.168.0.0/16 \
  --apiserver-advertise-address=<MASTER_NODE_IP> \
  --upload-certs

# Flannel CNI 사용 시
sudo kubeadm init \
  --pod-network-cidr=10.244.0.0/16 \
  --apiserver-advertise-address=<MASTER_NODE_IP>
```

> `<MASTER_NODE_IP>`: 워커 노드가 접근할 수 있는 마스터 노드의 실제 IP

### 1-2. kubectl 설정 (마스터 노드에서만)

```bash
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# 확인
kubectl get nodes
```

### 1-3. CNI 플러그인 설치

**Calico (권장):**
```bash
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.29.0/manifests/tigera-operator.yaml
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.29.0/manifests/custom-resources.yaml

# 설치 확인 (모든 Pod가 Running 될 때까지 대기)
watch kubectl get pods -n calico-system
```

**Flannel (경량 환경):**
```bash
kubectl apply -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml
```

### 1-4. 마스터 노드 상태 확인

```bash
kubectl get nodes
# NAME        STATUS   ROLES           AGE   VERSION
# master-01   Ready    control-plane   Xm    v1.32.x

kubectl get pods -A
# 모든 Pod가 Running 상태여야 함
```

---

## 2. 워커 노드 조인

### 2-1. 조인 토큰 확인 (마스터 노드에서)

`kubeadm init` 완료 시 출력된 join 명령어를 사용합니다.
토큰이 만료(24시간)되었거나 분실한 경우 재발급:

```bash
# 마스터 노드에서 실행
kubeadm token create --print-join-command
```

출력 예시:
```
kubeadm join 10.0.0.10:6443 --token abcdef.0123456789abcdef \
  --discovery-token-ca-cert-hash sha256:xxxxxxxxxxxx...
```

### 2-2. 워커 노드 조인 (워커 노드에서)

```bash
# 마스터에서 출력된 명령어 그대로 실행
sudo kubeadm join <MASTER_IP>:6443 \
  --token <TOKEN> \
  --discovery-token-ca-cert-hash sha256:<HASH>
```

### 2-3. 조인 확인 (마스터 노드에서)

```bash
kubectl get nodes
# NAME        STATUS   ROLES           AGE   VERSION
# master-01   Ready    control-plane   Xm    v1.32.x
# worker-01   Ready    <none>          Xm    v1.32.x
# worker-02   Ready    <none>          Xm    v1.32.x
```

---

## 3. GPU 노드 추가 설정 (워커 노드)

GPU가 장착된 워커 노드에는 NVIDIA Device Plugin을 설치합니다.

### 3-1. NVIDIA Container Toolkit (워커 노드에서)

```bash
# NVIDIA Container Toolkit 저장소 추가
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit

# containerd에 NVIDIA runtime 설정
sudo nvidia-ctk runtime configure --runtime=containerd
sudo systemctl restart containerd
```

### 3-2. NVIDIA Device Plugin (마스터 노드에서)

```bash
kubectl create -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.17.0/deployments/static/nvidia-device-plugin.yml

# GPU 노드 확인
kubectl get nodes -o=custom-columns=NAME:.metadata.name,GPU:.status.allocatable."nvidia\.com/gpu"
```

---

## 4. 클러스터 초기화 (재시작 필요 시)

```bash
# 노드에서 클러스터 설정 초기화
sudo kubeadm reset

# iptables 규칙 정리
sudo iptables -F && sudo iptables -X
sudo iptables -t nat -F && sudo iptables -t nat -X

# CNI 디렉토리 정리
sudo rm -rf /etc/cni/net.d

# kubeconfig 삭제
rm -rf $HOME/.kube
```

---

## 5. 주요 트러블슈팅

| 증상 | 확인 명령어 | 조치 |
|------|------------|------|
| 노드 NotReady | `kubectl describe node <name>` | CNI 미설치 또는 kubelet 오류 |
| Pod Pending | `kubectl describe pod <name>` | 리소스 부족, taint 확인 |
| kubelet 오류 | `journalctl -u kubelet -f` | cgroup driver 불일치 |
| containerd 오류 | `journalctl -u containerd -f` | `SystemdCgroup = true` 확인 |
| 토큰 만료 | `kubeadm token list` | `kubeadm token create --print-join-command` |

### cgroup driver 불일치 확인

```bash
# containerd 설정 확인
grep -A2 'SystemdCgroup' /etc/containerd/config.toml
# SystemdCgroup = true 이어야 함

# kubelet cgroup driver 확인
cat /var/lib/kubelet/config.yaml | grep cgroupDriver
# cgroupDriver: systemd 이어야 함
```
