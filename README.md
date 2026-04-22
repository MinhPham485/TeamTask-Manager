Monitoring and Observability
This project includes a complete monitoring setup for backend and AI endpoints using Prometheus and Grafana.
The goal is to track API throughput, latency, and error rate in real time, and provide production-style visibility for troubleshooting and performance analysis.

## Monitoring Dashboard
![Grafana Overview](docs/images/grafana-overview.png)
The dashboard tracks HTTP and AI throughput, error rate, and p95 latency in real time.
<img width="1130" height="727" alt="image" src="https://github.com/user-attachments/assets/1eb69732-db6c-483d-be4a-3a857b41efd6" />


Stack
Prometheus for metrics scraping and query engine
Grafana for dashboard visualization
Node.js backend instrumented with custom metrics using prom-client
How to run
Start services:
docker compose -f docker-compose.dev.yml up -d --build

Open monitoring tools:

Prometheus: http://localhost:9090
Grafana: http://localhost:3000
Grafana default login:
Username: admin
Password: admin
Key metrics
teamtask_http_requests_total
Total HTTP requests, labeled by method, route, and status_code

teamtask_http_request_duration_ms
HTTP latency histogram, used for p95 and p99 latency

teamtask_ai_requests_total
Total AI API requests, labeled by method, endpoint, and status_code

teamtask_ai_request_duration_ms
AI latency histogram, used for p95 latency

teamtask_ai_request_errors_total
Total failed AI requests (status code >= 400)

Recommended dashboard panels
HTTP RPS
HTTP Error Rate
HTTP p95 Latency
AI RPS
AI Error Rate
AI p95 Latency
Recommended PromQL queries
HTTP RPS:
sum(rate(teamtask_http_requests_total[5m]))

HTTP Error Rate (%):
100 * ((sum(increase(teamtask_http_requests_total{status_code=~"[45].."}[$__range])) or on() vector(0)) / clamp_min((sum(increase(teamtask_http_requests_total[$__range])) or on() vector(0)), 1))

HTTP p95 Latency:
histogram_quantile(0.95, sum by (le) (rate(teamtask_http_request_duration_ms_bucket[$__rate_interval])))

AI RPS:
sum(rate(teamtask_ai_requests_total[5m]))

AI Error Rate (%):
100 * ((sum(increase(teamtask_ai_requests_total{status_code=~"[45].."}[$__range])) or on() vector(0)) / clamp_min((sum(increase(teamtask_ai_requests_total[$__range])) or on() vector(0)), 1))

AI p95 Latency:
histogram_quantile(0.95, sum by (le) (rate(teamtask_ai_request_duration_ms_bucket[$__rate_interval])))
### Reliability and Performance Panels

![Error and Latency Panels](docs/images/grafana-error-latency.png)
<img width="1130" height="385" alt="image" src="https://github.com/user-attachments/assets/fcbcc606-815f-43d8-9b75-b2052d36b6c4" />

Notes
Error rate may stay near 0% during normal operation. This is expected when the system is healthy.
For demo screenshots, generate synthetic traffic first to make dashboard trends clearer.
Use panel units consistently:
RPS panels: req/s
Error rate panels: percent (0-100)
Latency panels: milliseconds
