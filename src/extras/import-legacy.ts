import { importLegacyMarkdownJobs } from '../legacy/importer';

export async function runLegacyImportCommand(options: { directory?: string; dryRun?: boolean }): Promise<void> {
  const result = await importLegacyMarkdownJobs(options);
  console.log('\nLegacy Markdown import complete');
  console.log(`- Discovered: ${result.discovered}`);
  console.log(`- Imported: ${result.imported}`);
  console.log(`- Skipped (already present): ${result.skippedExisting}`);
  console.log(`- Skipped (invalid): ${result.skippedInvalid}`);
}
