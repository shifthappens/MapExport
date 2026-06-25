// Unit test for the multilingual street-name abbreviator (ABBREV/abbreviateName).
// Pure functions in script.js — sliced out and eval'd in isolation, same as
// road-merge.mjs does for the stitcher.
import assert from 'node:assert/strict';
import { SCRIPT_PATH, fs } from './lib.mjs';

const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
const start = src.indexOf('const ABBREV=[');
const end = src.indexOf('function buildLabelsLayer');
assert.ok(start !== -1 && end > start, 'could not locate ABBREV/abbreviateName in script.js');
const { abbreviateName } = new Function(src.slice(start, end) + '\nreturn { abbreviateName };')();

let pass = 0, fail = 0;
const check = (input, expected) => {
  const got = abbreviateName(input);
  if (got === expected) { pass++; console.log(`  ok   ${input} → ${got}`); }
  else { fail++; console.log(`  FAIL ${input} → ${got} (expected ${expected})`); }
};

// Germanic / Scandinavian compound suffixes
check('Voltstraat', 'Voltstr.');
check('Professor Dondersstraat', 'Prof. Dondersstr.');
check('Generaal de Wetstraat', 'Gen. de Wetstr.');
check('Sint Sebastiaanstraat', 'St. Sebastiaanstr.');
check('Korveldwarsstraat', 'Korveldwarsstr.');
check('Koningsplein', 'Koningspl.');
check('Friedrichstraße', 'Friedrichstr.');
check('Beatrixlaan', 'Beatrixln.');
check('Aleksanterinkatu', 'Aleksanterink.');
check('Storgatan', 'Storg.');
// Romance / Slavic / Turkic / Finno-Ugric standalone type words
check('Rue de la Paix', 'R. de la Paix');
check('Avenida Diagonal', 'Av. Diagonal');
check('Plaza Mayor', 'Pl. Mayor');
check('Plaça Catalunya', 'Pl. Catalunya');
check('Via Roma', 'V. Roma');
check('Viale Europa', 'V.le Europa');
check('Calle Mayor', 'C/ Mayor');
check('Boulevard Anspach', 'Bd Anspach');
check('Ulica Długa', 'ul. Długa');
check('Kossuth utca', 'Kossuth u.');
// titles
check('Doctor Willem Dreeslaan', 'Dr. Willem Dreesln.');
check('San Sebastián', 'S. Sebastián');
check('Santa Maria', 'Sta. Maria');
// Cyrillic prefix
check('улица Тверская', 'ул. Тверская');
// No matching rule → unchanged (graceful fallback)
check('Hoofdweg', 'Hoofdweg');
check('Damrak', 'Damrak');

console.log(`\nabbreviate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
