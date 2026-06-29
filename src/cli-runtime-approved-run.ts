export async function renderApprovedRuntimeRun(): Promise<string> {
  throw new Error(
    'This runtime path has been retired. Use codemind agent --mode APPROVED_EXECUTION for direct work, or codemind runtime run <goal> --read-only for bounded read-only runtime loops.',
  )
}
