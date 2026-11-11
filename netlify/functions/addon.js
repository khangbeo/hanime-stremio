/**
 * serverless function for Hanime Stremio Addon
 */

const serverless = require('serverless-http');
const express = require('express');
const path = require('path');
const { getRouter } = require('stremio-addon-sdk');
const generateLandingHTML = require('../../lib/templates/landing_template');
const addonInterface = require('../../addon');
const apiClient = addonInterface.apiClient; // Get the shared apiClient instance
const userApiManager = addonInterface.userApiManager; // Shared per-user API manager
const createImageProxyMiddleware = require('../../lib/middleware/proxy_image_middleware');
const config = require('../../lib/config');
const logger = require('../../lib/logger');

const app = express();

app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`, {
    ip: req.ip || req.headers['x-forwarded-for'],
    userAgent: req.get('user-agent')?.substring(0, 50) || 'unknown'
  });
  next();
});

const landingHTML = generateLandingHTML(addonInterface.manifest);
const hasConfig = (addonInterface.manifest.config || []).length > 0;

// Handle landing page - redirect to /configure if config is required
app.get('/', (req, res) => {
  if (hasConfig && addonInterface.manifest.behaviorHints?.configurationRequired) {
    res.redirect('/configure');
  } else {
    res.setHeader('content-type', 'text/html');
    res.end(landingHTML);
  }
});

// Handle configuration page (required when config is defined)
if (hasConfig) {
  app.get('/configure', (req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(landingHTML);
  });
}

// Credentials verification endpoint used by the configure page.
// This mirrors the /verify route in server.js, which was missing from the
// Netlify function — without it, POST /verify fell through to Express's
// HTML 404 page and the configure page failed with:
// "Unexpected token '<', "<!DOCTYPE "..." is not valid JSON"
// serverless-http presets req.body to the raw Buffer, which makes
// express.json() skip parsing in Express 5 — normalize it back to an
// object so the handler below works the same as on the standalone server.
function normalizeVerifyBody(req, res, next) {
  try {
    if (Buffer.isBuffer(req.body)) {
      req.body = req.body.length ? JSON.parse(req.body.toString('utf8')) : {};
    } else if (typeof req.body === 'string') {
      req.body = req.body ? JSON.parse(req.body) : {};
    }
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body.' });
  }
  next();
}

app.post('/verify', express.json({ limit: '4kb' }), normalizeVerifyBody, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ ok: false, error: 'Email and password are required.' });
  }
  try {
    const userApi = await userApiManager.getUserApi(email, password);
    return res.json({ ok: true, isPremium: !!userApi.isPremium });
  } catch (err) {
    logger.warn('Credential verification failed', {
      emailPrefix: email.substring(0, 3) + '***',
      error: err && err.message ? err.message : String(err)
    });
    return res.status(401).json({ ok: false, error: 'Invalid credentials or upstream error.' });
  }
});

app.use(getRouter(addonInterface));

app.get('/proxy/image/:id/:type', (req, res, next) => {
  logger.debug('Proxy request received', {
    path: req.path,
    id: req.params.id,
    type: req.params.type
  });
  next();
}, createImageProxyMiddleware(config, apiClient));

app.use('/images', express.static(path.join(__dirname, '../../public/images')));
app.use('/css', express.static(path.join(__dirname, '../../public/css')));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: addonInterface.manifest.version,
    cacheEnabled: config.cache.enabled,
    prefetchEnabled: config.cache.prefetch?.enabled || false
  });
});

// Binary support required for image responses in serverless
module.exports.handler = serverless(app, {
  binary: ['image/*', 'application/octet-stream']
});
