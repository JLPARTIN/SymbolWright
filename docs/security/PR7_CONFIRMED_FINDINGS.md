# PR 7 Confirmed Findings Ledger

Audit base: `13f66d98e8e011fb33144433b094a15a0ea9279e`

This temporary ledger records confirmed findings while fixes are developed. It will be removed and incorporated into `SANDBOX_FINAL_ADVERSARIAL_AUDIT.md` before final review.

- Brokered egress has no production construction or `openSession` caller; only tests exercise the broker.
- Governed dependency acquisition has no production `DependencyAcquisitionService` construction; only tests exercise the service.
- Dependency acquisition swallows durable evidence-persistence failures and can return success without mandatory evidence.
- Egress request authorization failures occur before the audit/metrics boundary, leaving denied attempts unrecorded.
- Egress policy and cancellation are not rechecked after DNS immediately before transport.
- Dependency DNS resolution is not cancellation-aware and dependency acquisition does not recheck live global/profile revision controls during active network work.
- The egress JSONL audit parent check rejects a direct parent symlink but does not prove every ancestor is a real directory before recursive creation.

All findings remain FAIL until fixed and re-audited.
