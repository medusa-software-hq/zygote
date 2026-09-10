# zygote

Owns the identity the `platform` stack runs as, and the grants that bound it.

Applied by hand, as an organization admin. Everything else in the organization is
applied by a pipeline; this is what issues those pipelines their credentials, so it
cannot depend on them.

```bash
cd infra && pulumi up
```

## ESC environments

`platform/gcp` — written by this program. Edits made in the Pulumi Cloud console are
overwritten on the next apply.

`platform/github` — hand-managed, and the only copy of the GitHub App private key
(GitHub shows it once). Rotate with the command in the environment's own header. If
the environment itself is lost, `pulumi env init platform/github` and set the values
`platform`'s program requires; a replacement key can be generated from the App's
settings.
