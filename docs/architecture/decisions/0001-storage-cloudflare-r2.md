# ADR-0001 — Product Media Storage: Cloudflare R2 via the Medusa File Module

Status: ACCEPTED (implemented 2026-08-16)

## Context

The platform stores product media (images) for a baby-clothing catalog.
AGENTS.md §11 requires:

- Medusa-first storage: use Medusa's native file service/storage provider
  architecture; a custom media abstraction is only permitted if the native
  architecture cannot satisfy the requirement.
- The catalog/DB retains only media references/metadata — never image
  binaries in PostgreSQL.
- R2 object URLs are not assumed to be the customer-facing delivery URL.
- Upload security: validate MIME type and size; never trust user-provided
  extensions; safe filenames/keys; no path traversal.

Verified facts (installed Medusa 2.19.0, 2026-08-16):

- `@medusajs/file` + `@medusajs/file-s3` + `@medusajs/file-local` are
  installed (transitive deps of `@medusajs/medusa`), resolvable via
  `@medusajs/medusa/file-*` package names.
- Default module registration (non-cloud): file module with the **local**
  provider; Medusa Cloud defaults to `file-s3`. User module entries replace
  the default per module name (`transformModules`, last wins). Omitted
  entries keep the default; a falsy value would `disable` the module.
- The file module accepts exactly one provider.
- `file-s3` options: `file_url`, `region`, `bucket`, `prefix`, `endpoint`,
  `access_key_id`, `secret_access_key`, `authentication_method`
  (default `access-key`), `cache_control`, `download_file_duration`,
  `additional_client_config` (spread into the S3 client — supports
  `forcePathStyle`), `acl` (`false` omits the ACL header).
  Upload keys are `{prefix}{dir/}{name}-{ulid}{ext}` with traversal
  sanitization; the returned URL is `{file_url}/{encodedKey}`.
- Cloudflare R2 (official docs): S3 API endpoint
  `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`; bucket region is `auto`
  (empty/`us-east-1` alias to it); R2 does **not** support ACL headers
  (`PutObject` ACL ❌), so `acl: false` is mandatory; R2 API tokens provide
  SigV4 access-key credentials.
- Upload surface: `POST /admin/uploads` only (multer memoryStorage, **no
  core size/MIME limits** — core TODO); `GET /admin/uploads`,
  `GET|DELETE /admin/uploads/:id`, `POST /admin/uploads/presigned-urls`.
  There is **no store-facing upload route** (verified — customers cannot
  upload directly).
- The Medusa server serves `<cwd>/static` at `/static`, making the local
  provider's default URLs work in dev.

## Decision

1. **Use the Medusa file module with the native `file-s3` provider for
   Cloudflare R2 in production.** No custom media abstraction, no new
   dependencies. Catalog data references files via the module's
   `{id: key, url}` records; PostgreSQL never stores image binaries.
2. **Env-gated configuration** in `apps/backend/medusa-config.ts`:
   - `FILE_PROVIDER=s3` → `[Modules.FILE]` with
     `@medusajs/medusa/file` + `@medusajs/medusa/file-s3` provider,
     options: `authentication_method: "access-key"` (R2 API tokens),
     `acl: false` (R2 rejects ACL headers), `additional_client_config:
     { forcePathStyle: true }` (R2 path-style endpoint), `region: "auto"`,
     `endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com`,
     `file_url` = public delivery base (R2 custom domain/CDN — NOT assumed
     to be the raw R2 object URL), optional `prefix`.
   - `FILE_PROVIDER` unset → the file module key is omitted entirely, so
     Medusa's default local provider applies (dev/test). Variable names are
     documented in `.env.example` (names only).
3. **Upload validation middleware** (`src/api/middlewares.ts`,
   `defineMiddlewares`, `routes:` form — the loader requires the `routes`
   key; a bare route object is silently dropped). Runs on
   `POST /admin/uploads` after core multipart parsing (plugin middlewares
   are registered after core middlewares and before route handlers, so
   `req.files` is populated and the core handler is never reached on
   rejection): MIME allowlist (jpeg/png/webp/gif/avif — images only; SVG
   excluded as an XSS vector) and size cap `MEDUSA_UPLOAD_MAX_SIZE_MB`
   (default 5). Rejections are `400 INVALID_DATA` and never persisted.
4. **Local dev**: files land in `apps/backend/static/` (gitignored) and are
   served at `/static` by the backend.

## Alternatives

- **Custom media module/storage abstraction** — rejected: Medusa's file
  module already provides the required abstraction (upload/delete/retrieve/
  presigned URLs, provider boundary); a custom abstraction would duplicate
  it (AGENTS.md §11, Medusa-first hierarchy).
- **Direct R2 SDK calls from catalog code** — rejected: bypasses Medusa's
  provider architecture, breaks S3/Cloudinary migration, no workflow
  integration (upload compensation, file records).
- **Pre-parse upload limits (multer `limits` / streaming validation)** —
  not implementable without replacing the core upload route or adding
  dependencies: the framework's `bodyParser` config only affects
  json/text/urlencoded; multipart is parsed by core `upload.array("files")`
  with no configurable limits. The residual risk (a large upload is
  buffered in memory before the validation middleware rejects it) is
  limited to authenticated admin sessions (admin auth runs before
  parsing). Deferred to the security-hardening phase.
- **No upload validation** — rejected: AGENTS.md §11/§14 require MIME and
  size validation at the upload boundary; core provides none (verified
  TODO).

## Consequences

- Production media flows: `Admin upload → file module (file-s3) → R2`;
  catalog stores file ids/URLs only; delivery URLs come from `file_url`
  (custom domain/CDN), not the raw R2 endpoint.
- Switching providers (S3/Cloudinary) later requires only a config change
  — no catalog changes.
- Upload policy (MIME allowlist, size cap) is centralized in
  `src/api/middlewares.ts` and env-configurable (`MEDUSA_UPLOAD_MAX_SIZE_MB`).
- The memory-buffering gap for oversized uploads remains a documented
  security-hardening backlog item (see gap-analysis entry 2).
- R2 wiring itself is not integration-tested (no credentials in CI/dev);
  the integration suite exercises the local provider and the shared
  validation middleware. R2 behavior is verified against official
  Cloudflare docs and installed provider source.