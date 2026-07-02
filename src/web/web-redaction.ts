import { redactValidationOutput } from '../runtime/validation/validation-output-redactor.js'

/** Redacts secrets/paths from fetched page text and search snippets before evidence output. */
export function redactWebText(text: string): string {
  return redactValidationOutput(text)
}
