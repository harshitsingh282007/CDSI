const fs = require('fs');
const path = require('path');

const filePath = path.join('/Users/harshit/Desktop/CDSI/artifacts/cdsi-platform/src/pages/Report.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace all occurrences of report.<arrayProperty> with safe<Property>
// BUT only in the JSX/render section! Actually, just globally is fine except where we define safe<Property>
// Wait, we defined:
// const safeLabParameters = report.labParameters ?? [];
// If we replace report.labParameters globally, it becomes const safeLabParameters = safeLabParameters ?? []; which is bad!

// Better approach: just mutate a local copy called `r` and replace `report.` with `r.`?
// Even better: just mutate `report` inside a useMemo!
// Actually, modifying `report` properties directly is easiest if we do it carefully:

content = content.replace(
  'if (!report) {',
  `
  // Ensure all arrays are initialized to prevent rendering crashes
  const r = report ? {
    ...report,
    labParameters: report.labParameters || [],
    findings: report.findings || [],
    criticalValues: report.criticalValues || [],
    prescriptions: report.prescriptions || [],
    organSystems: report.organSystems || [],
    possibleConditions: report.possibleConditions || [],
    nextSteps: report.nextSteps || [],
  } : null;

  if (!r) {`
);

// Replace ALL `report.` with `r.` EXCEPT in the lines before `if (!r) {`
// Actually, let's just do a regex replace on the whole file, but only after `if (!r) {`

const parts = content.split('if (!r) {');
if (parts.length === 2) {
  let after = parts[1];
  after = after.replace(/report\./g, 'r.');
  content = parts[0] + 'if (!r) {' + after;
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully patched Report.tsx');
} else {
  console.log('Could not find split point');
}
