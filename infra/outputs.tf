output "vm_name" {
  description = "Name of the Compute Engine instance running K3s"
  value       = google_compute_instance.vm.name
}

output "static_ip_address" {
  description = "Static external IPv4 address retained when only the VM is recreated"
  value       = google_compute_address.vm_ip.address
}
