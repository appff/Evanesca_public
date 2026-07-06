#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const pdfPath = "docs/technical-report/evanesca-technical-report.pdf";
const fullPath = path.join(root, pdfPath);

function fail(message) {
  console.error(`public artifact validation failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(fullPath)) {
  fail(`missing required file: ${pdfPath}`);
}

const stat = fs.statSync(fullPath);
if (!stat.isFile()) {
  fail(`required path is not a file: ${pdfPath}`);
}

const pdf = fs.readFileSync(fullPath);
if (pdf.subarray(0, 4).toString("utf8") !== "%PDF") {
  fail(`${pdfPath}: missing PDF header`);
}

if (pdf.length < 100000) {
  fail(`${pdfPath}: PDF unexpectedly small`);
}

console.log("public artifact validation passed");
