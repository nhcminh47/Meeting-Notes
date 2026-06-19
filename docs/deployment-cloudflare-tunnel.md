# Cloudflare Tunnel Deployment

Cloudflare Tunnel is a possible way to expose a privately hosted GPU ASR service over HTTPS without
publishing the origin directly. Operators provide their own hostname, tunnel credentials, and API
key outside the repository.

The tunnel does not replace application authentication: protected ASR endpoints still require an
API key. Configure TLS, request-size and timeout limits, origin firewall rules, and access logs that
exclude credentials and meeting content. Never commit a real tunnel hostname or token.
