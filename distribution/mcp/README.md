# Official MCP Registry listing

Published October 13, 2026: **md.myself/mcp**, version **1.0.0**, active and latest at publication. The remote transport is Streamable HTTP at <https://myself.md/mcp>.

[View the official Registry entry](https://registry.modelcontextprotocol.io/v0.1/servers?search=md.myself%2Fmcp).

`server.json` is the published manifest. `dns-proof.txt` and `dns-record.json` describe the apex public-key TXT record installed in Cloudflare. Existing DNS records were preserved. The official publisher validated the manifest, authenticated the domain namespace and reported successful publication; the Registry API confirmed the exact name, version, endpoint and active/latest state.

The remote-only listing needs no npm package or uploaded credentials. Users still authenticate to the MCP server through OAuth and their existing data grants. The Registry entry does not imply Claude directory approval.

For a future release, update the manifest version, check the live endpoint, validate with the official publisher, and reauthenticate shortly before publishing. The signing key is private under ignored `.local/mcp-registry/key.pem`. The official CLI token is short-lived and stored privately in `~/.config/mcp-publisher/token.json`. Use the retained local login helper to load the seed without printing it. Never put the signing key or token in this directory.
