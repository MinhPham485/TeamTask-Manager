variable "project" {
  description = "Google Cloud Project ID"
  type        = string
}
variable "region" {
  description = "Google Cloud Region"
  type        = string
  default     = "us-central1"
}
variable "zone" {
  description = "Google Cloud Zone"
  type        = string
  default     = "us-central1-a"
}