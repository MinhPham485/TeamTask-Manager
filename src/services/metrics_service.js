const client = require('prom-client');

const register = new client.Registry();

client.collectDefaultMetrics({
  register,
  prefix: 'teamtask_',
});

const httpRequestDurationMs = new client.Histogram({
  name: 'teamtask_http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [50, 100, 200, 300, 500, 1000, 2000, 5000],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'teamtask_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const aiRequestsTotal = new client.Counter({
  name: 'teamtask_ai_requests_total',
  help: 'Total number of AI API requests',
  labelNames: ['method', 'endpoint', 'status_code'],
  registers: [register],
});

const aiRequestDurationMs = new client.Histogram({
  name: 'teamtask_ai_request_duration_ms',
  help: 'Duration of AI API requests in ms',
  labelNames: ['method', 'endpoint', 'status_code'],
  buckets: [50, 100, 200, 300, 500, 1000, 2000, 5000, 10000],
  registers: [register],
});

const aiRequestErrorsTotal = new client.Counter({
  name: 'teamtask_ai_request_errors_total',
  help: 'Total number of failed AI API requests',
  labelNames: ['method', 'endpoint', 'status_code'],
  registers: [register],
});

const resolveEndpointLabel = (req) => {
  const routePath = req.route?.path;

  if (routePath) {
    return `${req.baseUrl || ''}${routePath}` || req.path;
  }

  return req.originalUrl?.split('?')[0] || req.path || 'unknown';
};

function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics') {
    return next();
  }

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route?.path || req.path || 'unknown';
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    httpRequestDurationMs.observe(labels, duration);
    httpRequestsTotal.inc(labels);
  });

  next();
}

function aiMetricsMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const labels = {
      method: req.method,
      endpoint: resolveEndpointLabel(req),
      status_code: String(res.statusCode),
    };

    aiRequestsTotal.inc(labels);
    aiRequestDurationMs.observe(labels, duration);

    if (res.statusCode >= 400) {
      aiRequestErrorsTotal.inc(labels);
    }
  });

  next();
}

async function metricsHandler(req, res) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

module.exports = {
  metricsMiddleware,
  aiMetricsMiddleware,
  metricsHandler,
};