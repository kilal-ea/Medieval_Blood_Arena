import { runPhysicsVerificationSuite } from './PhysicsVerification';

async function main() {
  console.log('Running Medieval Blood Arena Physics Verification Suite...');
  const results = await runPhysicsVerificationSuite();
  let allPassed = true;
  for (const r of results) {
    const tag = r.passed ? 'PASS' : 'FAIL';
    console.log(`[${tag}] ${r.name} (${r.durationMs}ms) -> ${r.details}`);
    if (!r.passed) allPassed = false;
  }
  if (!allPassed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
