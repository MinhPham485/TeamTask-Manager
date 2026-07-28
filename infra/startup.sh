#!/bin/bash
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y \
    docker.io \
    docker-compose-v2 \
    git \
    curl

systemctl enable docker
systemctl start docker

if id "minhpham" >/dev/null 2>&1; then
    usermod -aG docker minhpham
fi

docker --version
docker compose version