# Optional private S3-compatible files

FREE CRM can keep documents in a user-owned, private S3-compatible bucket. This
is an **explicit server-side option**, not a new default or a migration tool.
Local files/R2 and private Vercel Blob keep their existing behavior when
`FREE_CRM_OBJECT_STORAGE` is unset or `default`.

The adapter is feature-tested against a disposable local **RustFS 1.0.0-rc.6**
evaluation service in Node.js and Cloudflare workerd. That prerelease is not a
production hosting recommendation. This is not a claim that every S3 provider
works, or that a live AWS account or a hosted customer deployment was tested.

## Before opting in

Use a dedicated, empty **general-purpose bucket** and an operator-managed
credential restricted to that bucket. The operator—not FREE CRM—must configure:

- All four public-access blocks: `BlockPublicAcls`, `IgnorePublicAcls`,
  `BlockPublicPolicy`, and `RestrictPublicBuckets`, each `true`.
- No public bucket policy. An explicitly absent policy is acceptable.
- No bucket versioning, including suspended versioning; no MFA Delete.
- No Object Lock or retention configuration. Directory buckets are unsupported.
- HTTPS with a valid certificate and the exact endpoint/region expected by the
  provider. Redirects are rejected, including region redirects.

The application verifies those settings before every storage operation. Missing,
denied, malformed, or unsupported verification APIs stop storage access; a bucket
name, an environment assertion, an anonymous 403, or a successful HEAD is not
proof of privacy. FREE CRM never changes bucket policy, ACLs, public-access
blocks, versioning, or retention. Administrators who can change bucket settings
remain trusted; a check cannot prevent a separate administrator changing a
bucket immediately afterward.

Native R2 remains the R2 path. Do not select S3 for R2 endpoints that do not
implement the required privacy APIs. See the provider's
[S3 compatibility table](https://developers.cloudflare.com/r2/api/s3/api/).

## Configure the server

Supply these values through your server's secret/environment settings. Never
put credentials in browser code, a `NEXT_PUBLIC_*` variable, screenshots, source
control, or issue reports. On Workers use bindings/secrets; on Vercel use project
environment settings. The checked-in example contains no credentials.

```dotenv
FREE_CRM_OBJECT_STORAGE=s3
FREE_CRM_S3_ENDPOINT=https://your-provider-endpoint.example
FREE_CRM_S3_REGION=your-region
FREE_CRM_S3_BUCKET=your-private-crm-bucket
FREE_CRM_S3_ACCESS_KEY_ID=<server-secret>
FREE_CRM_S3_SECRET_ACCESS_KEY=<server-secret>
# Optional, only for explicitly supplied temporary credentials:
# FREE_CRM_S3_SESSION_TOKEN=<server-secret>
```

The endpoint must be an origin, without an embedded user/password, path, query,
or fragment. The SDK receives only these explicit credentials: no default AWS
credential discovery, profile lookup, or instance-metadata authentication.
Temporary credentials must be refreshed by the operator before expiry.

Selected-but-incomplete S3 configuration and unknown provider names fail closed;
they never silently fall back to a different store. An S3-selected installation
does not require an R2 binding or a Blob token. Database/auth configuration is
still required and unchanged. The health endpoint verifies the selected store;
bootstrap reports its non-secret provider label.

The standard Wrangler templates still declare the default `FILES` R2 binding.
For an S3-only Worker, remove that R2 binding from **your own S3 deployment
configuration**, keeping DB and authentication bindings. Do not alter a deployed
default-provider configuration or assume environment selection migrates its
documents. Default checked-in templates intentionally keep R2.

For a separately managed, local-only evaluation server, literal `127.0.0.1` or
`[::1]` with an explicit port is allowed only when **both**
`FREE_CRM_LOCAL_MODE=true` and `FREE_CRM_S3_ALLOW_LOOPBACK=true`. Vercel disallows
this exception. `localhost` and arbitrary HTTP endpoints are rejected. These
flags do not launch a storage service.

## Least-privilege application credential

For AWS-style IAM, replace `YOUR-PRIVATE-CRM-BUCKET` below with the dedicated
bucket. Confirm the equivalent permissions with your provider. Use a separate
operator credential for bucket setup; do not grant configuration mutation,
public policy/ACL writes, bucket creation/deletion, version deletion, or account
administration to the running application.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VerifyPrivateBucketAndListForBoundedCleanup",
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketPublicAccessBlock",
        "s3:GetBucketVersioning",
        "s3:GetBucketPolicyStatus",
        "s3:GetBucketObjectLockConfiguration",
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::YOUR-PRIVATE-CRM-BUCKET"
    },
    {
      "Sid": "PrivateCrmObjectsOnly",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR-PRIVATE-CRM-BUCKET/*"
    }
  ]
}
```

The app serves multiple workspaces from that dedicated bucket and enforces each
workspace prefix in its server-side storage contract. This policy is bucket-
scoped, not a replacement for application tenant authorization. `ListBucket`
also permits distinguishing an absent object from denied access. Unexpected 403
responses are not treated as missing files. Provider-specific encryption/KMS
permissions require a separate, least-privilege operator review; this guide does
not grant them implicitly.

## Safety and recovery contract

- Files stay private and are downloaded through the authorized application;
  there are no public or presigned download URLs.
- Uploads and reads are bounded to **4 MiB on Vercel, 10 MiB elsewhere**. Actual
  bytes are counted; declared lengths cannot bypass the bound. SDK bucket-control
  XML is capped at 8 MiB (including escaped, full-length keys). Reads and complete SDK requests have 10-second
  deadlines; SDK requests permit at most two attempts within that deadline.
- Keys use `workspace/~epoch/00000000000000000001/record/blob`. The epoch is fixed
  width, and the complete key cannot exceed 1,024 UTF-8 bytes. Legacy keys require
  an ASCII product-record directory. Arbitrary pre-existing bucket contents or
  malformed reserved namespaces are not accepted as product files.
- Creation uses `If-None-Match: *`, not an overwrite. If the response is lost,
  recovery reads the stored bytes and compares their SHA-256 and exact content
  headers. Provider ETags and metadata alone are not content proof.
- Reads verify workspace metadata, byte length, and SHA-256 before returning
  content. International attachment names use bounded RFC 5987 headers.
- Reset lists at most 1,000 keys, validates the raw tenant prefix and UTF-8 sort
  order, and deletes only legacy or older-epoch objects. Current/newer epochs
  survive. Per-key partial deletion failures retain the existing durable cleanup
  receipt for retry; an HTTP-success response alone does not complete cleanup.

The same upload-intent, mutation-fence, authorization, and cleanup-outbox routes
are used with every provider. Full-buffer integrity checks are intentional for
these small-file limits; this is not a multipart/large-object streaming service.

## Switching providers is not data migration

Document references do not include a provider identity. Changing the environment
does **not** copy objects or repair references. Do not switch an active workspace
with existing documents or pending cleanup receipts. Keep its current provider
until an operator-designed migration preserves exact keys, bytes, required
integrity metadata, and database references, with a tested backup and rollback.
There is no automatic provider-migration feature in this slice. Returning the
setting to `default` simply selects the original store again; it does not move
new S3 files back.

## Reproduce the disposable Windows evaluation

`npm run smoke:s3` is an opt-in local QA command, not a setup command for a real
bucket. It accepts no existing endpoint or credentials. It starts only a pinned
RustFS executable on literal loopback, with an empty generated data directory,
console disabled, and random process-only test credentials. It creates and
changes only that disposable test bucket, verifies anonymous denial and public-
policy rejection, tests the real adapter in Node and workerd, then stops its
exact child process. Ignored synthetic data is retained for inspection.

Download the official asset into `outputs/s3-evaluation/` and extract it into
`outputs/s3-evaluation/bin/` before running the command:

- [Official release and Windows asset](https://github.com/rustfs/rustfs/releases/tag/1.0.0-rc.6)
- Filename: `rustfs-windows-x86_64-v1.0.0-rc.6.zip`
- Exact size: `101397387` bytes
- SHA-256: `e9f4ad57ea8596a41d0e5879c565784021663ecca32c40e69527cf575f107f97`

Verify both size and SHA-256 **before extracting or executing**. The smoke command
rechecks the archive and extracted executable against the archive's pinned
contents. It does not install a service or delete the synthetic data afterward.

```powershell
$env:FREE_CRM_S3_QA = 'synthetic-disposable'
npm run smoke:s3
```

Unit conformance and route regressions run with `npm run test:coverage` without
any bucket or credential. Full release gates also include both `npm run build`
and `npm run build:vercel`; a build alone is not proof of storage compatibility.

## Protocol references

- [AWS private-bucket controls](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetPublicAccessBlock.html)
- [Conditional object creation](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html)
- [Bucket versioning status](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketVersioning.html)
- [Object Lock status](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObjectLockConfiguration.html)
- [RustFS feature compatibility evidence](https://docs.rustfs.com/en/reference/s3-compatibility)
- [RustFS Windows evaluation guidance](https://docs.rustfs.com/en/installation/windows)
