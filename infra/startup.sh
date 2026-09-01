#!/bin/bash
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y \
    ca-certificates \
    curl

curl -sfL https://get.k3s.io | \
  INSTALL_K3S_VERSION="v1.36.4+k3s1" \
  sh -s - server --write-kubeconfig-mode 0644

systemctl is-active --quiet k3s
k3s kubectl get node