#!/usr/bin/env node
// Test double for MARKILO_EMBEDDER: "similarity" = how close the two PNG file sizes are. Only checks the plumbing.
import { statSync } from 'node:fs';

const [a, b] = process.argv.slice(2).map((p) => statSync(p).size);
console.log((Math.min(a, b) / Math.max(a, b)).toFixed(4));
