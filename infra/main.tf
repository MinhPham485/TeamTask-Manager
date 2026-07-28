resource "google_compute_network" "main" {
  name                    = "task-manager-network"
  auto_create_subnetworks = true
}

resource "google_compute_firewall" "allow_ssh" {
  name    = "allow-ssh"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["web-server"]
}

resource "google_compute_firewall" "allow_http" {
  name    = "allow-http"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["80"]
  }

  source_ranges = ["0.0.0.0/0"]

  target_tags = ["web-server"]
}

resource "google_compute_firewall" "allow_https" {
  name    = "allow-https"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = ["0.0.0.0/0"]

  target_tags = ["web-server"]
}

resource "google_compute_address" "vm_ip" {
  name   = "task-manager-static-ip"
  region = var.region
}
resource "google_compute_instance" "vm" {
  name         = "task-manager-vm"
  machine_type = "e2-micro"
  zone         = var.zone

  tags = ["web-server"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"
      size  = 20
    }
  }

  network_interface {
    network = google_compute_network.main.id

    access_config {
      nat_ip = google_compute_address.vm_ip.address
    }
  }
  metadata_startup_script = file("${path.module}/startup.sh")
  metadata = {
    ssh-keys = "minhpham:${file("/Users/minhpham/.ssh/github_actions_deploy.pub")}"
  }
}